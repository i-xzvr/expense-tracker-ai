import { randomUUID } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { saveToSyncFolder } from "./sync-folder";
import { parsePortableBackup } from "./backup";
import { guardLocalRequest } from "../ai/server";
import { isObject } from "../ai/validation";
import { localJson, apiError, json, V4Error, privateHeaders } from "./http";
import { generateExport, validateExport } from "./export";
import { operations } from "./database";
import { connectOneDrive, deliverExport, integrationStatus, pollOneDrive } from "./cloud";

export async function v4Route(request: Request, segments: string[]): Promise<Response> {
  try {
    guardLocalRequest(request);
    const path = segments.join("/");
    const db = operations();
    if (request.method === "GET") {
      if (path === "history") return json({ history: db.history() });
      if (path === "schedules") return json({ schedules: db.schedules().map(({ snapshot, ...rest }) => ({ ...rest, snapshotCapturedAt: JSON.parse(snapshot).generatedAt ?? JSON.parse(snapshot).createdAt })) });
      if (path === "integrations") return json(await integrationStatus());
      if (/^shares\/[a-f0-9-]{36}$/.test(path)) {
        const raw = db.shared(segments[1]); if (!raw) throw new V4Error(410, "SHARE_EXPIRED", "This local share expired or was revoked.");
        const { request: input, report } = validateExport(JSON.parse(raw));
        const file = await generateExport(input, report);
        return new Response(new Uint8Array(file.bytes).buffer, { headers: { ...privateHeaders, "Content-Type": file.mime, "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename) } });
      }
      throw new V4Error(404, "NOT_FOUND", "Unknown V4 route.");
    }
    const body = await localJson(request, ["backup-schedules","backups/sync"].includes(path) ? 140_000_000 : 8 * 1024 * 1024);
    if (request.method === "DELETE" && isObject(body) && typeof body.id === "string") {
      if (path === "schedules") { db.removeSchedule(body.id); return json({ removed: true }); }
      if (path === "shares") { db.revokeShare(body.id); return json({ revoked: true }); }
    }
    if (request.method !== "POST") throw new V4Error(405, "METHOD_NOT_ALLOWED", "Unsupported method.");
    if (path === "backups/sync") {
      if (!isObject(body) || body.confirmed !== true) throw new V4Error(400,"CONFIRM_REQUIRED","Confirm saving this private combined backup to OneDrive.");
      let backup; try { backup = parsePortableBackup(JSON.stringify(body.backup)); } catch { throw new V4Error(400,"INVALID_BACKUP","The combined backup is invalid."); }
      return json(await saveToSyncFolder(new TextEncoder().encode(JSON.stringify(backup)),"expense-tracker-v4-complete.json","Backups"));
    }
    if (path === "backup-schedules") {
      if (!isObject(body) || body.confirmed !== true || ![24,168,720].includes(Number(body.intervalHours)) || (body.destination !== undefined && !["local-backup","onedrive-sync"].includes(String(body.destination)))) throw new V4Error(400,"CONFIRM_REQUIRED","Confirm this captured backup schedule and its local or OneDrive destination.");
      let backup;
      try { backup = parsePortableBackup(JSON.stringify(body.backup)); } catch { throw new V4Error(400,"INVALID_BACKUP","The combined backup is invalid."); }
      const id = randomUUID();
      const folder = join(process.cwd(),"data","v4-backup-snapshots");
      await mkdir(folder,{recursive:true});await writeFile(join(folder,id+".json"),JSON.stringify(backup),{mode:0o600});
      db.saveSchedule({id,name:body.destination === "onedrive-sync" ? "OneDrive combined backup" : "Local combined backup",enabled:true,intervalHours:Number(body.intervalHours),nextAt:Date.now()+Number(body.intervalHours)*3600_000,destination:body.destination === "onedrive-sync" ? "sync-backup" : "local-backup",snapshot:JSON.stringify({file:id,createdAt:backup.createdAt})});
      return json({id,capturedAt:backup.createdAt},201);
    }
    if (path === "integrations/connect") return json(await connectOneDrive());
    if (path === "integrations/poll" && isObject(body) && typeof body.flow === "string") return json(await pollOneDrive(body.flow));
    if (path === "export" || path === "shares" || path === "delivery" || path === "schedules") {
      if (!isObject(body)) throw new V4Error(400, "INVALID_REQUEST", "Invalid request.");
      const { request: input, report } = validateExport(path === "export" ? body : body.export);
      if (path === "shares") {
        if (body.confirmed !== true) throw new V4Error(400, "CONFIRM_REQUIRED", "Confirm sharing this snapshot on this device.");
        return json(db.share(JSON.stringify({ ...input, expenses: report.expenses }), 24), 201);
      }
      if (path === "schedules") {
        if (body.confirmed !== true || !["onedrive-sync","onedrive","sheets"].includes(String(body.destination)) || typeof body.target !== "string" || ![24,168,720].includes(Number(body.intervalHours)) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) throw new V4Error(400, "INVALID_SCHEDULE", "Confirm a daily, weekly or 30-day captured-snapshot schedule and its destination.");
        const schedule = { id: randomUUID(), name: body.name, enabled: true, intervalHours: Number(body.intervalHours), nextAt: Date.now() + Number(body.intervalHours) * 3600_000, destination: JSON.stringify({ provider: body.destination, target: body.target }), snapshot: JSON.stringify({ ...input, expenses: report.expenses }) };
        db.saveSchedule(schedule); return json({ id: schedule.id, nextAt: schedule.nextAt }, 201);
      }
      if (path === "delivery") {
        if (body.confirmed !== true || !["onedrive-sync","onedrive","sheets"].includes(String(body.destination)) || typeof body.target !== "string") throw new V4Error(400, "CONFIRM_REQUIRED", "Choose and confirm the cloud destination.");
        try {
          const result = await deliverExport(input, body.destination as "onedrive-sync" | "onedrive" | "sheets", body.target);
          const entry = db.record({ filename: result.filename, format: input.format, count: report.summary.count, totalCents: report.summary.totalCents, destination: String(body.destination), status: body.destination === "onedrive-sync" ? "queued-for-sync" : "delivered" });
          return json({ ...result, historyId: entry.id });
        } catch (error) {
          db.record({ filename: input.filename, format: input.format, count: report.summary.count, totalCents: report.summary.totalCents, destination: String(body.destination), status: "failed", error: error instanceof V4Error ? error.message : "Connection failed; delivery unconfirmed." });
          throw error;
        }
      }
      const file = await generateExport(input, report);
      const entry = db.record({ filename: file.filename, format: input.format, count: report.summary.count, totalCents: report.summary.totalCents, destination: "browser", status: "prepared" });
      return new Response(new Uint8Array(file.bytes).buffer, { headers: { ...privateHeaders, "Content-Type": file.mime, "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename), "X-Export-Id": entry.id, "X-Export-Warnings": encodeURIComponent(file.warnings.join(" ")) } });
    }
    throw new V4Error(404, "NOT_FOUND", "Unknown V4 route.");
  } catch (error) { return apiError(error); }
}
