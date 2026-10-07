import type { ChatPlatform } from "./chat-store";

interface LegacyHistory { sourceId: string; raw: string }
export interface LegacyChatStorage { read(): Promise<LegacyHistory | null>; finish(sourceId: string, raw: string): Promise<void> }

/** Keep old data until the server commits. The source ID makes retries safe after a lost reply. */
export async function migrateLegacyChats(legacy: LegacyChatStorage, request: (body: unknown) => Promise<unknown>) {
  const history = await legacy.read();
  if (!history) return;
  await request({ action: "migrate", sourceId: history.sourceId, raw: history.raw });
  await legacy.finish(history.sourceId, history.raw);
}

function legacyBrowserStorage(): LegacyChatStorage {
  let database: Promise<IDBDatabase> | undefined;
  const open = () => database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("expense-tracker-v3-chats", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history");
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = request.onblocked = () => reject(new Error("Legacy browser chat history could not be opened. Close older V3 tabs and retry."));
  });
  return {
    async read() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readwrite");
        const store = transaction.objectStore("history");
        let raw: string | undefined, sourceId: string | undefined, migrated = false;
        store.get("archive").onsuccess = event => { raw = (event.target as IDBRequest).result; };
        store.get("sqlite-migrated-v1").onsuccess = event => { migrated = (event.target as IDBRequest).result === true; };
        const source = store.get("sqlite-source-id");
        source.onsuccess = () => { sourceId = source.result ?? crypto.randomUUID(); if (!source.result) store.put(sourceId, "sqlite-source-id"); };
        transaction.oncomplete = () => resolve(!migrated && raw !== undefined && sourceId ? { raw, sourceId } : null);
        transaction.onabort = transaction.onerror = () => reject(new Error("Legacy chat history could not be read. Existing browser history is retained."));
      });
    },
    async finish(sourceId, raw) {
      const db = await open();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("history", "readwrite");
        const store = transaction.objectStore("history");
        const request = store.get("archive");
        let conflict = false;
        request.onsuccess = () => {
          if (request.result !== raw) { conflict = true; transaction.abort(); return; }
          store.delete("archive"); // Remove the migrated duplicate only after the SQLite commit.
          store.put(true, "sqlite-migrated-v1");
          store.put(sourceId, "sqlite-source-id");
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = transaction.onerror = () => reject(new Error(conflict ? "An older V3 tab changed browser history during migration. Close older tabs, export that browser history if needed, and refresh V3." : "Chats are in SQLite, but legacy cleanup could not finish. Retry in the original browser profile."));
      });
    },
  };
}

export async function retainedBrowserChats(): Promise<string | null> {
  return (await legacyBrowserStorage().read())?.raw ?? null;
}

export function serverChatPlatform(fetcher: typeof fetch = fetch, legacy: LegacyChatStorage = legacyBrowserStorage()): ChatPlatform {
  const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("expense-tracker-v3-sqlite-chats") : null;
  let migration: Promise<void> | undefined;
  let warning: string | null = null;
  async function request(method: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetcher("/api/chats", { method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Local SQLite chat storage is unavailable.");
    return result;
  }
  async function ensureMigration() {
    migration ??= migrateLegacyChats(legacy, body => request("POST", body)).then(() => { warning = null; }).catch(error => { migration = undefined; warning = error instanceof Error ? error.message : "Legacy chat migration could not finish; browser history is retained."; });
    await migration;
  }
  return {
    warning: () => warning,
    async read() {
      await ensureMigration();
      const result = await request("GET");
      if (!(result.raw === null || typeof result.raw === "string")) throw new Error("The SQLite chat response was invalid.");
      return result.raw;
    },
    async write(raw, expected) {
      const digest = expected === null ? null : await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected));
      const expectedHash = digest === null ? null : Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      await request("PUT", { raw, expectedHash }); channel?.postMessage("changed");
    },
    async remove(id, expectedUpdatedAt) { await request("DELETE", { id, expectedUpdatedAt, confirmed: true }); channel?.postMessage("changed"); },
    subscribe(listener) {
      if (typeof window === "undefined") return () => {};
      channel?.addEventListener("message", listener);
      window.addEventListener("focus", listener);
      // Poll only while visible so different browser profiles also receive updates.
      const timer = setInterval(() => { if (document.visibilityState === "visible") listener(); }, 5000);
      return () => { channel?.removeEventListener("message", listener); window.removeEventListener("focus", listener); clearInterval(timer); };
    },
  };
}
