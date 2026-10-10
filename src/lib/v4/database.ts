import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface ExportHistory { id: string; at: number; filename: string; format: string; count: number; totalCents: number; destination: string; status: string; error?: string }
export interface Schedule { id: string; name: string; enabled: boolean; intervalHours: number; nextAt: number; destination: string; snapshot: string; lastStatus?: string }
export function openOperations(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;");
  db.exec("CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,at INTEGER NOT NULL,payload TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY,expires INTEGER NOT NULL,payload TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY,payload TEXT NOT NULL) STRICT;");
  return {
    history: () => db.prepare("SELECT payload FROM history ORDER BY at DESC LIMIT 200").all().map(row => JSON.parse(row.payload as string) as ExportHistory),
    record(input: Omit<ExportHistory, "id" | "at">) { const entry = { ...input, id: randomUUID(), at: Date.now() }; db.prepare("INSERT INTO history VALUES(?,?,?)").run(entry.id, entry.at, JSON.stringify(entry)); return entry; },
    share(snapshot: string, hours: number) { const id = randomUUID(); const expires = Date.now() + hours * 3600_000; db.prepare("DELETE FROM shares WHERE expires<?").run(Date.now()); db.prepare("INSERT INTO shares VALUES(?,?,?)").run(id, expires, snapshot); return { id, expires }; },
    shared(id: string): string | null { const row = db.prepare("SELECT payload FROM shares WHERE id=? AND expires>?").get(id, Date.now()); return row ? row.payload as string : null; },
    revokeShare(id: string) { db.prepare("DELETE FROM shares WHERE id=?").run(id); },
    schedules: (): Schedule[] => db.prepare("SELECT payload FROM schedules").all().map(row => JSON.parse(row.payload as string) as Schedule),
    saveSchedule(schedule: Schedule) { db.prepare("INSERT OR REPLACE INTO schedules VALUES(?,?)").run(schedule.id, JSON.stringify(schedule)); },
    finishSchedule(schedule: Schedule) { return db.prepare("UPDATE schedules SET payload=? WHERE id=?").run(JSON.stringify(schedule), schedule.id).changes === 1; },
    removeSchedule(id: string) { db.prepare("DELETE FROM schedules WHERE id=?").run(id); },
    close() { db.close(); },
  };
}
const globalDb = globalThis as typeof globalThis & { __v4Operations?: Map<string, ReturnType<typeof openOperations>> };
export function operations(): ReturnType<typeof openOperations> {
  const path = resolve(/*turbopackIgnore: true*/ process.env.V4_OPERATIONS_PATH ?? "data/v4-operations.sqlite");
  const cache = globalDb.__v4Operations ??= new Map<string, ReturnType<typeof openOperations>>();
  if (!cache.has(path)) cache.set(path, openOperations(path));
  return cache.get(path)!;
}
