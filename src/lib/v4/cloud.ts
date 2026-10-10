import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ExportRequest } from "./export";
import { generateExport, validateExport } from "./export";
import { V4Error } from "./http";

import { syncFolderStatus, saveToSyncFolder } from "./sync-folder";
const run = promisify(execFile);
const vaultPath = () => process.env.V4_TOKEN_VAULT ?? join(process.cwd(), "data", "v4-cloud.dpapi");
interface Tokens { access_token: string; refresh_token?: string; expires_at: number }
async function protect(input: string, decrypt: boolean): Promise<string> {
  if (process.platform !== "win32") throw new V4Error(503, "VAULT_PLATFORM", "The cloud credential vault requires Windows DPAPI.");
  const script = decrypt ? "$v=[Console]::In.ReadToEnd() | ConvertTo-SecureString; [Console]::Out.Write((New-Object System.Net.NetworkCredential('', $v)).Password)" : "$v=ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force; [Console]::Out.Write(($v | ConvertFrom-SecureString))";
  // Secrets travel on stdin, never in process command arguments or console logs.
  return new Promise((resolve, reject) => {
    const child = run("powershell.exe", ["-NoProfile","-NonInteractive","-Command",script], { windowsHide: true, timeout: 10_000, maxBuffer: 256_000 });
    child.child.stdin?.end(input);
    child.then(result => resolve(result.stdout.trim()), () => reject(new V4Error(503, "VAULT_FAILED", "The Windows credential vault could not be opened.")));
  });
}
async function saveTokens(value: Tokens) { await mkdir(join(vaultPath(), ".."), { recursive: true }); await writeFile(vaultPath(), await protect(JSON.stringify(value), false), { mode: 0o600 }); }
async function readTokens(): Promise<Tokens | null> { try { return JSON.parse(await protect(await readFile(/*turbopackIgnore: true*/ vaultPath(), "utf8"), true)); } catch { return null; } }
async function providerJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
  const value = await response.json();
  return { response, value };
}
const msBase = () => "https://login.microsoftonline.com/" + encodeURIComponent(process.env.V4_MS_TENANT ?? "consumers") + "/oauth2/v2.0/";
const deviceFlows = new Map<string, { code: string; expires: number; nextPoll: number; interval: number }>();
export async function integrationStatus() {
  const token = await readTokens();
  return { syncFolder: await syncFolderStatus(), onedrive: { configured: !!process.env.V4_MS_CLIENT_ID, authorized: !!token, expiresAt: token?.expires_at ?? null }, sheets: { configured: !!process.env.V4_GOOGLE_ACCESS_TOKEN || !!(process.env.V4_GOOGLE_REFRESH_TOKEN && process.env.V4_GOOGLE_CLIENT_ID && process.env.V4_GOOGLE_CLIENT_SECRET), authorized: false }, email: { mode: "draft", description: "Opens your email app; attach the downloaded report. No automatic sending." } };
}
export async function connectOneDrive() {
  const id = process.env.V4_MS_CLIENT_ID;
  if (!id) throw new V4Error(503, "CLIENT_ID_REQUIRED", "Set V4_MS_CLIENT_ID to your registered Microsoft public-client application ID. See docs/v4-cloud.md.");
  const { response, value } = await providerJson(msBase() + "devicecode", { method: "POST", body: new URLSearchParams({ client_id: id, scope: "Files.ReadWrite offline_access" }) });
  if (!response.ok || !value.device_code) throw new V4Error(502, "PROVIDER_REJECTED", "Microsoft could not start sign-in. Check public-client configuration.");
  const flow = randomUUID(); const interval = Math.max(5, Number(value.interval) || 5) * 1000;
  deviceFlows.set(flow, { code: value.device_code, expires: Date.now() + value.expires_in * 1000, nextPoll: Date.now() + interval, interval });
  return { flow, code: value.user_code, url: value.verification_uri, expiresIn: value.expires_in, intervalMs: interval };
}
export async function pollOneDrive(flow: string) {
  const pending = deviceFlows.get(flow);
  if (!pending || pending.expires < Date.now()) throw new V4Error(410, "SIGNIN_EXPIRED", "Start sign-in again.");
  if (Date.now() < pending.nextPoll) return { pending: true };
  pending.nextPoll = Date.now() + pending.interval;
  const { response, value } = await providerJson(msBase() + "token", { method: "POST", body: new URLSearchParams({ client_id: process.env.V4_MS_CLIENT_ID!, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: pending.code }) });
  if (value.error === "authorization_pending" || value.error === "slow_down") { if (value.error === "slow_down") pending.interval += 5000; return { pending: true }; }
  if (!response.ok || !value.access_token) { deviceFlows.delete(flow); throw new V4Error(401, "SIGNIN_REJECTED", "Microsoft sign-in was denied or expired."); }
  await saveTokens({ access_token: value.access_token, refresh_token: value.refresh_token, expires_at: Date.now() + value.expires_in * 1000 });
  deviceFlows.delete(flow); return { connected: true };
}
async function msToken() {
  let tokens = await readTokens();
  if (!tokens) throw new V4Error(401, "SIGNIN_REQUIRED", "Connect OneDrive before delivery.");
  if (tokens.expires_at < Date.now() + 60_000) {
    if (!tokens.refresh_token || !process.env.V4_MS_CLIENT_ID) throw new V4Error(401, "SIGNIN_REQUIRED", "Reconnect OneDrive.");
    const { response, value } = await providerJson(msBase() + "token", { method: "POST", body: new URLSearchParams({ client_id: process.env.V4_MS_CLIENT_ID, grant_type: "refresh_token", refresh_token: tokens.refresh_token }) });
    if (!response.ok || !value.access_token) throw new V4Error(401, "SIGNIN_REQUIRED", "OneDrive authorization expired. Reconnect.");
    tokens = { access_token: value.access_token, refresh_token: value.refresh_token ?? tokens.refresh_token, expires_at: Date.now() + value.expires_in * 1000 };
    await saveTokens(tokens);
  }
  return tokens.access_token;
}
export async function deliverExport(input: ExportRequest, destination: "onedrive" | "onedrive-sync" | "sheets", target: string, fetcher: typeof fetch = fetch, tokenOverride?: string) {
  const { request, report } = validateExport(input);
  const file = await generateExport(request, report);
  if (destination === "onedrive-sync") return saveToSyncFolder(file.bytes, file.filename, "Reports");
  if (destination === "onedrive") {
    if (!/^[a-zA-Z0-9 _.-]{1,100}$/.test(target) || target.includes("..")) throw new V4Error(400, "INVALID_TARGET", "Choose a single OneDrive folder name without slashes or ..; it must already exist.");
    const token = tokenOverride ?? await msToken();
    const dot = file.filename.lastIndexOf(".");
    const filename = file.filename.slice(0,dot) + "-" + randomUUID().slice(0,8) + file.filename.slice(dot);
    const response = await fetcher("https://graph.microsoft.com/v1.0/me/drive/root:/" + encodeURIComponent(target) + "/" + encodeURIComponent(filename) + ":/content", { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": file.mime }, body: new Uint8Array(file.bytes).buffer, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new V4Error(response.status === 401 ? 401 : 502, "DELIVERY_FAILED", "OneDrive rejected the upload. Check authorization/folder; no delivery was confirmed.");
    const item = await response.json();
    if (typeof item.id !== "string") throw new V4Error(502, "INVALID_PROVIDER_RESPONSE", "OneDrive did not return an uploaded file ID.");
    return { provider: destination, id: item.id as string };
  }
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(target)) throw new V4Error(400, "INVALID_TARGET", "Enter the Google spreadsheet ID.");
  let token = tokenOverride ?? process.env.V4_GOOGLE_ACCESS_TOKEN;
  if (!token && process.env.V4_GOOGLE_REFRESH_TOKEN && process.env.V4_GOOGLE_CLIENT_ID && process.env.V4_GOOGLE_CLIENT_SECRET) {
    const result = await providerJson("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: process.env.V4_GOOGLE_CLIENT_ID, client_secret: process.env.V4_GOOGLE_CLIENT_SECRET, refresh_token: process.env.V4_GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" }) });
    if (result.response.ok) token = result.value.access_token;
  }
  if (!token) throw new V4Error(401, "SIGNIN_REQUIRED", "Configure Google OAuth credentials on the server; see docs/v4-cloud.md.");
  // RAW prevents formula execution. A new sheet per snapshot avoids overwriting unrelated cells.
  const sheetTitle = "Export-" + randomUUID().slice(0, 8);
  const base = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(target);
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const created = await fetcher(base + ":batchUpdate", { method: "POST", headers, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetTitle } } }] }), redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!created.ok) throw new V4Error(502, "DELIVERY_FAILED", "Google could not create the export sheet. Check spreadsheet access.");
  const response = await fetcher(base + "/values/" + encodeURIComponent(sheetTitle + "!A1") + "?valueInputOption=RAW", { method: "PUT", headers, body: JSON.stringify({ values: [["Date","Category","Amount (USD)","Description"], ...report.expenses.map(row => [row.date, row.category, row.amount, row.description])] }), redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new V4Error(502, "PARTIAL_DELIVERY", "An empty export sheet was created, but writing rows failed. Review it before retrying.");
  const value = await response.json();
  if (value.updatedRows !== report.expenses.length + 1) throw new V4Error(502, "PARTIAL_DELIVERY", "Google did not confirm every exported row. Review the new sheet.");
  return { provider: destination, id: target + "/" + sheetTitle };
}
