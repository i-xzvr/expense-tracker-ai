import { mkdir, realpath, stat, open, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { V4Error } from "./http";

// A server-only root, never a caller-supplied absolute path. No new account grant.
const configuredRoot = () => process.env.V4_ONEDRIVE_ROOT ?? process.env.OneDriveConsumer ?? process.env.OneDrive;
export async function syncFolderStatus() {
  const root = configuredRoot();
  try {
    if (!root || !isAbsolute(root) || !(await stat(root)).isDirectory()) throw new Error();
    return { available: true, root, folder: "Expense Tracker V4", cloudConfirmed: false, status: "Folder available; check OneDrive's tray icon for cloud sync completion." };
  } catch { return { available: false, root: null, folder: "Expense Tracker V4", cloudConfirmed: false, status: "Installed OneDrive folder unavailable. Sign in to the desktop sync app." }; }
}
export async function saveToSyncFolder(bytes: Uint8Array, filename: string, kind: "Reports" | "Backups") {
  const root = configuredRoot();
  if (!root || !isAbsolute(root)) throw new V4Error(503,"SYNC_FOLDER_UNAVAILABLE","The installed OneDrive folder is unavailable.");
  // Restrict all filenames and destinations, and resolve junctions before writing.
  if (!filename || filename.length > 120 || /[<>:"/\\|?*]/.test(filename) || [...filename].some(c=>c.charCodeAt(0)<32) || /[. ]$/.test(filename)) throw new V4Error(400,"INVALID_FILENAME","Invalid sync filename.");
  const realRoot = await realpath(root);
  let folder = realRoot;
  for (const part of ["Expense Tracker V4", kind]) {
    folder = join(/*turbopackIgnore: true*/ folder,part); await mkdir(folder,{recursive:true}); folder = await realpath(/*turbopackIgnore: true*/ folder);
    const inside = relative(realRoot,folder);
    if (!inside || inside === ".." || inside.startsWith(".."+sep) || isAbsolute(inside)) throw new V4Error(403,"UNSAFE_SYNC_FOLDER","The export folder resolves outside OneDrive.");
  }
  const dot = filename.lastIndexOf(".");
  const unique = (dot > 0 ? filename.slice(0,dot) : filename) + "-" + Date.now() + "-" + randomUUID().slice(0,8) + (dot > 0 ? filename.slice(dot) : "");
  const path = join(folder,unique);
  const handle = await open(path,"wx",0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  const expected = createHash("sha256").update(bytes).digest("hex");
  const actual = createHash("sha256").update(await readFile(/*turbopackIgnore: true*/ path)).digest("hex");
  if (expected !== actual) throw new V4Error(500,"SYNC_WRITE_FAILED","Saved file verification failed; inspect the sync folder before retrying.");
  return { provider: "onedrive-sync", id: unique, path, status: "queued-for-sync", cloudConfirmed: false, sha256: actual };
}
