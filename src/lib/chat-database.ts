// Server only. SQLite is provided by the pinned Node 24 runtime, never by the browser.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseChatArchive, type ChatArchive, type Conversation, type SavedMessage } from "./chat-store";

export class ChatDatabaseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const emptyArchive = (): ChatArchive => ({ schema: 1, conversations: [] });
function incomingArchive(raw: string) {
  try { return parseChatArchive(raw); }
  catch { throw new ChatDatabaseError(400, "The chat archive is invalid or exceeds the history limits. Existing chats have not been changed."); }
}
type ChatRow = { id: string; mode: Conversation["mode"]; title: string; draft: string; updated_at: number };
type MessageRow = { id: string; chat_id: string; role: SavedMessage["role"]; content: string; status: SavedMessage["status"]; at: number; result_json: string | null; month: string | null };

export function openChatDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000, enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false, allowExtension: false });
  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version.user_version > 1) { db.close(); throw new ChatDatabaseError(503, "This chat database needs a newer V3 version. It has not been changed."); }
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('general','finance')),
      title TEXT NOT NULL, draft TEXT NOT NULL, updated_at REAL NOT NULL,
      position INTEGER NOT NULL UNIQUE
    ) STRICT;
    CREATE TABLE IF NOT EXISTS messages (
      chat_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      id TEXT NOT NULL, position INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('complete','failed','stopped')), at REAL NOT NULL,
      result_json TEXT, month TEXT,
      PRIMARY KEY(chat_id,id), UNIQUE(chat_id,position)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS migrated_sources (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS deleted_chats (id TEXT PRIMARY KEY) STRICT;
    PRAGMA user_version=1;
  `);
  function readArchive(): ChatArchive {
    const chats = db.prepare("SELECT id,mode,title,draft,updated_at FROM conversations ORDER BY position").all() as ChatRow[];
    const messages = db.prepare("SELECT chat_id,id,role,content,status,at,result_json,month FROM messages ORDER BY chat_id,position").all() as MessageRow[];
    const grouped = new Map<string, SavedMessage[]>();
    for (const row of messages) {
      const items = grouped.get(row.chat_id) ?? [];
      items.push({ id: row.id, role: row.role, content: row.content, status: row.status, at: row.at, ...(row.result_json === null ? {} : { result: JSON.parse(row.result_json) }), ...(row.month === null ? {} : { month: row.month }) });
      grouped.set(row.chat_id, items);
    }
    return parseChatArchive(JSON.stringify({ schema: 1, conversations: chats.map(row => ({ id: row.id, mode: row.mode, title: row.title, draft: row.draft, updatedAt: row.updated_at, messages: grouped.get(row.id) ?? [] })) }));
  }
  function read(): string | null {
    return db.prepare("SELECT value FROM metadata WHERE key='initialized'").get() ? JSON.stringify(readArchive()) : null;
  }
  function transaction<T>(change: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try { const result = change(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function putArchive(archive: ChatArchive, before: ChatArchive) {
    const old = new Map(before.conversations.map(chat => [chat.id, chat]));
    const nextPosition = (db.prepare("SELECT coalesce(max(position),-1)+1 AS position FROM conversations").get() as { position: number }).position;
    let position = nextPosition;
    for (const chat of archive.conversations) {
      const previous = old.get(chat.id);
      if (previous && previous.mode !== chat.mode) throw new ChatDatabaseError(409, "A conversation's mode cannot be changed. Open a chat in the correct mode.");
      if (!previous && db.prepare("SELECT id FROM deleted_chats WHERE id=?").get(chat.id)) throw new ChatDatabaseError(409, "This conversation was permanently deleted. Start a new chat.");
      if (JSON.stringify(previous) === JSON.stringify(chat)) continue;
      if (previous) db.prepare("UPDATE conversations SET title=?,draft=?,updated_at=? WHERE id=?").run(chat.title, chat.draft, chat.updatedAt, chat.id);
      else db.prepare("INSERT INTO conversations(id,mode,title,draft,updated_at,position) VALUES(?,?,?,?,?,?)").run(chat.id, chat.mode, chat.title, chat.draft, chat.updatedAt, position++);
      if (!previous || JSON.stringify(previous.messages) !== JSON.stringify(chat.messages)) {
        db.prepare("DELETE FROM messages WHERE chat_id=?").run(chat.id);
        const insert = db.prepare("INSERT INTO messages(chat_id,id,position,role,content,status,at,result_json,month) VALUES(?,?,?,?,?,?,?,?,?)");
        chat.messages.forEach((message, index) => insert.run(chat.id, message.id, index, message.role, message.content, message.status, message.at, message.result ? JSON.stringify(message.result) : null, message.month ?? null));
      }
    }
    db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES('initialized','1')").run();
  }
  return {
    read,
    write(raw: string, expected: string | null, hashed = false) {
      const archive = incomingArchive(raw);
      return transaction(() => {
        const current = read();
        const token = hashed && current !== null ? createHash("sha256").update(current).digest("hex") : current;
        if (token !== expected) throw new ChatDatabaseError(409, "Chat history changed in another tab. Refresh the history and try again.");
        const before = current === null ? emptyArchive() : parseChatArchive(current);
        const nextIds = new Set(archive.conversations.map(chat => chat.id));
        if (before.conversations.some(chat => !nextIds.has(chat.id))) throw new ChatDatabaseError(400, "Use the confirmed individual-chat deletion control to remove a conversation.");
        putArchive(archive, before);
      });
    },
    migrate(sourceId: string, raw: string) {
      const incoming = incomingArchive(raw);
      const fingerprint = createHash("sha256").update(raw).digest("hex");
      return transaction(() => {
        const migrated = db.prepare("SELECT fingerprint FROM migrated_sources WHERE id=?").get(sourceId) as { fingerprint: string } | undefined;
        if (migrated) {
          if (migrated.fingerprint !== fingerprint) throw new ChatDatabaseError(409, "An older tab changed browser chats after migration. The changed browser history is retained; export it before closing old tabs. SQLite history has not been overwritten.");
          return;
        }
        const archive = readArchive();
        for (const chat of incoming.conversations) {
          if (db.prepare("SELECT id FROM deleted_chats WHERE id=?").get(chat.id)) continue;
          const existing = archive.conversations.find(item => item.id === chat.id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(chat)) throw new ChatDatabaseError(409, "A legacy chat conflicts with the SQLite history. Existing chats have not been changed. Export the old browser history before resolving the conflict.");
          if (!existing) archive.conversations.push(chat);
        }
        const validated = parseChatArchive(JSON.stringify(archive));
        putArchive(validated, readArchive());
        db.prepare("INSERT INTO migrated_sources(id,fingerprint) VALUES(?,?)").run(sourceId, fingerprint);
      });
    },
    remove(id: string, expectedUpdatedAt: number) {
      return transaction(() => {
        const chat = db.prepare("SELECT updated_at FROM conversations WHERE id=?").get(id) as { updated_at: number } | undefined;
        if (!chat) return; // Repeated confirmation is idempotent.
        if (chat.updated_at !== expectedUpdatedAt) throw new ChatDatabaseError(409, "This chat changed after the deletion warning opened. Review it and confirm again.");
        db.prepare("DELETE FROM conversations WHERE id=?").run(id); // Foreign key removes every message and evidence snapshot.
        db.prepare("INSERT OR IGNORE INTO deleted_chats(id) VALUES(?)").run(id);
      });
    },
    close() { db.close(); },
  };
}

type ChatDatabase = ReturnType<typeof openChatDatabase>;
const databases = globalThis as typeof globalThis & { __v3ChatDatabases?: Map<string, ChatDatabase> };
export function getChatDatabase(): ChatDatabase {
  // Runtime user data must never be traced into the application build/package.
  const path = resolve(/*turbopackIgnore: true*/ process.env.V3_CHAT_DATABASE_PATH ?? join(process.cwd(), "data", "chats.sqlite"));
  const cache = databases.__v3ChatDatabases ??= new Map();
  let database = cache.get(path);
  if (!database) { database = openChatDatabase(path); cache.set(path, database); }
  return database;
}
