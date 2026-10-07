import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ChatDatabaseError, openChatDatabase } from "../src/lib/chat-database";
import { createChatHandlers } from "../src/lib/chat-api";
import { createChatStore, parseChatArchive, type Conversation } from "../src/lib/chat-store";
import { migrateLegacyChats, serverChatPlatform, type LegacyChatStorage } from "../src/lib/chat-platform";

const chat = (id: string, mode: Conversation["mode"] = "general"): Conversation => ({ id, mode, title: `Test ${id}`, draft: `Unsent ${id}`, updatedAt: 100, messages: [{ id: `message-${id}`, role: "user", content: `Question ${id}`, status: "complete", at: 99 }] });
const archive = (...conversations: Conversation[]) => JSON.stringify({ schema: 1, conversations });
const hash = (raw: string | null) => raw === null ? null : createHash("sha256").update(raw).digest("hex");
function fixture(t: test.TestContext) {
  const directory = join(process.cwd(), "work", `sqlite-test-${randomUUID()}`);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "chats.sqlite");
  const database = openChatDatabase(path);
  t.after(() => {
    database.close();
    for (const name of ["chats.sqlite", "chats.sqlite-journal", "chats.sqlite-wal", "chats.sqlite-shm"]) { const file = join(directory, name); if (existsSync(file)) unlinkSync(file); }
    rmdirSync(directory);
  });
  return { path, database };
}

test("SQLite persists modes, drafts, ordered messages and financial evidence across connections", t => {
  const { path, database } = fixture(t);
  const finance = chat("finance", "finance");
  finance.messages.push({ id: "answer", role: "assistant", content: "$12.50", status: "complete", at: 101, month: "2026-10", result: { model: "test", answer: "$12.50", expenseIds: ["expense-one"], evidence: { intent: "total", period: { from: "2026-10-01", to: "2026-10-31" }, filters: { category: null, merchant: null, search: null }, count: 1, totalCents: 1250, categories: [], merchants: [], recurring: [], matches: [] } } });
  database.write(archive(chat("general"), finance), null);
  const connection = openChatDatabase(path);
  try {
    const stored = parseChatArchive(connection.read()!);
    assert.deepEqual(stored.conversations.map(item => item.mode), ["general", "finance"]);
    assert.equal(stored.conversations[0].draft, "Unsent general");
    assert.equal(stored.conversations[1].messages[1].result?.evidence.totalCents, 1250);
    assert.equal(stored.conversations[1].messages[1].month, "2026-10");
    assert.deepEqual(stored.conversations[1].messages.map(item => item.id), ["message-finance", "answer"]);
  } finally { connection.close(); }
  const sql = new DatabaseSync(path, { readOnly: true });
  try { assert.equal((sql.prepare("SELECT count(*) AS n FROM messages").get() as { n: number }).n, 3); }
  finally { sql.close(); }
  assert.equal(readFileSync(path).subarray(0, 16).toString(), "SQLite format 3\0");
});

test("SQLite atomically rejects stale writes, invalid archives, mode changes and unconfirmed wholesale deletion", t => {
  const { database } = fixture(t);
  database.write(archive(chat("one")), null);
  const old = database.read()!;
  const current = parseChatArchive(old); current.conversations[0].title = "New title";
  database.write(JSON.stringify(current), old);
  const saved = database.read();
  assert.throws(() => database.write(archive(chat("stale")), old), ChatDatabaseError);
  assert.throws(() => database.write('{"schema":1,"conversations":[{}]}', saved), /invalid/);
  assert.throws(() => database.write(archive(), saved), /confirmed/);
  const changed = parseChatArchive(saved!); changed.conversations[0].mode = "finance";
  assert.throws(() => database.write(JSON.stringify(changed), saved), /mode/);
  assert.equal(database.read(), saved);
});

test("permanent deletion cascades messages, removes text from SQLite pages and blocks stale resurrection", t => {
  const { path, database } = fixture(t);
  const removed = chat("removed"); removed.draft = "UNIQUE_REMOVED_DRAFT_74f0"; removed.messages[0].content = "UNIQUE_REMOVED_MESSAGE_13b1";
  database.write(archive(removed, chat("keep", "finance")), null);
  const old = database.read()!;
  assert.throws(() => database.remove("removed", 99), /changed/);
  assert.equal(database.read(), old);
  database.remove("removed", 100);
  assert.deepEqual(parseChatArchive(database.read()!).conversations.map(item => item.id), ["keep"]);
  assert.throws(() => database.write(old, old), /changed/);
  assert.throws(() => database.write(old, database.read()), /permanently deleted/);
  database.remove("removed", 100); // Repeated confirmation does not affect another chat.
  const sql = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal((sql.prepare("SELECT count(*) AS n FROM messages WHERE chat_id='removed'").get() as { n: number }).n, 0);
    assert.equal((sql.prepare("SELECT count(*) AS n FROM messages WHERE chat_id='keep'").get() as { n: number }).n, 1);
    assert.equal((sql.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  } finally { sql.close(); }
  const bytes = readFileSync(path);
  assert.equal(bytes.includes(Buffer.from(removed.draft)), false);
  assert.equal(bytes.includes(Buffer.from(removed.messages[0].content)), false);
  assert.equal(existsSync(`${path}-journal`), false);
});

test("migration merges once, retries a lost acknowledgement and cannot resurrect deleted legacy history", t => {
  const { database } = fixture(t);
  database.write(archive(chat("existing")), null);
  const legacy = archive(chat("legacy", "finance"));
  database.migrate("browser-one", legacy);
  assert.deepEqual(parseChatArchive(database.read()!).conversations.map(item => item.id), ["existing", "legacy"]);
  database.remove("legacy", 100);
  database.migrate("browser-one", legacy); // Browser missed the response/cleanup the first time.
  database.migrate("browser-two", legacy); // Another old profile has a copy of the deleted chat.
  assert.deepEqual(parseChatArchive(database.read()!).conversations.map(item => item.id), ["existing"]);
  assert.throws(() => database.migrate("browser-one", archive(chat("new-legacy"))), /older tab/);
  assert.deepEqual(parseChatArchive(database.read()!).conversations.map(item => item.id), ["existing"]);
});

test("migration conflicts roll back and invalid archives never replace the database", t => {
  const { database } = fixture(t);
  database.write(archive(chat("one")), null);
  const before = database.read();
  const conflict = chat("one"); conflict.draft = "Conflicting content";
  assert.throws(() => database.migrate("browser-one", archive(chat("two"), conflict)), /conflicts/);
  assert.equal(database.read(), before);
  assert.throws(() => database.migrate("browser-one", "not JSON"), /invalid/);
  assert.equal(database.read(), before);
  database.migrate("browser-one", archive(chat("two")));
  assert.equal(parseChatArchive(database.read()!).conversations.length, 2);
});

const request = (method: string, body?: unknown, headers: Record<string, string> = {}) => new Request("http://127.0.0.1:3103/api/chats", { method, headers: { host: "127.0.0.1:3103", origin: "http://127.0.0.1:3103", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

test("chat API enforces local origin, bounded JSON, hash conflicts and explicit individual confirmation", async t => {
  const { database } = fixture(t), handlers = createChatHandlers(() => database);
  assert.equal((await handlers.GET(request("GET"))).status, 200);
  assert.equal((await handlers.PUT(request("PUT", { raw: archive(chat("one")), expectedHash: null }))).status, 200);
  assert.equal((await handlers.GET(request("GET", undefined, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await handlers.DELETE(request("DELETE", { id: "one", confirmed: true, expectedUpdatedAt: 100 }, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await handlers.DELETE(request("DELETE", { id: "one", confirmed: false, expectedUpdatedAt: 100 }))).status, 400);
  assert.equal((await handlers.PUT(request("PUT", { raw: archive(chat("two")), expectedHash: null }))).status, 409);
  assert.equal((await handlers.PUT(request("PUT", { raw: "invalid", expectedHash: hash(database.read()) }))).status, 400);
  assert.equal((await handlers.DELETE(request("DELETE", { id: "one", confirmed: true, expectedUpdatedAt: 100 }, { "Content-Length": "5000" }))).status, 413);
  assert.equal((await handlers.POST(request("POST", { action: "migrate", sourceId: "../file", raw: archive() }))).status, 400);
  const browserWithoutOrigin = request("DELETE", { id: "one", confirmed: true, expectedUpdatedAt: 100 }, { "sec-fetch-site": "same-origin" }); browserWithoutOrigin.headers.delete("origin");
  assert.equal((await handlers.DELETE(browserWithoutOrigin)).status, 403);
  assert.equal((await handlers.DELETE(request("DELETE", { id: "one", confirmed: true, expectedUpdatedAt: 100 }))).status, 200);
  assert.equal(parseChatArchive(database.read()!).conversations.length, 0);
});

test("browser history cleanup happens only after a committed migration; retries retain the same source", async () => {
  let finished = false, calls = 0;
  const legacy: LegacyChatStorage = { read: async () => ({ sourceId: "same-source", raw: archive(chat("one")) }), finish: async () => { finished = true; } };
  await assert.rejects(migrateLegacyChats(legacy, async () => { calls++; throw new Error("Lost response"); }));
  assert.equal(finished, false);
  await migrateLegacyChats(legacy, async body => { calls++; assert.equal((body as { sourceId: string }).sourceId, "same-source"); return {}; });
  assert.equal(finished, true); assert.equal(calls, 2);
});

test("server chat platform preserves SQLite history when legacy import fails, then retries cleanly", async () => {
  let legacyError = true, finish = false;
  const legacy: LegacyChatStorage = { read: async () => { if (legacyError) throw new Error("Old history retained"); return null; }, finish: async () => { finish = true; } };
  const platform = serverChatPlatform(async () => Response.json({ raw: archive(chat("existing")) }), legacy);
  assert.equal(parseChatArchive((await platform.read())!).conversations.length, 1);
  assert.equal(platform.warning?.(), "Old history retained"); assert.equal(finish, false);
  legacyError = false; await platform.read(); assert.equal(platform.warning?.(), null);
});

test("two SQLite clients share history, preserve drafts and reject an update to a permanently deleted chat", async t => {
  const { database } = fixture(t), handlers = createChatHandlers(() => database);
  const fetcher: typeof fetch = async (_url, options) => {
    const method = options?.method ?? "GET";
    const body = options?.body === undefined ? undefined : JSON.parse(String(options.body));
    return handlers[method as keyof typeof handlers](request(method, body));
  };
  const legacy: LegacyChatStorage = { read: async () => null, finish: async () => {} };
  const first = createChatStore(serverChatPlatform(fetcher, legacy)), second = createChatStore(serverChatPlatform(fetcher, legacy));
  await first.load(); await second.load();
  const id = (await first.create("general", "Keep a draft"))!;
  await second.reload(); assert.equal(second.getSnapshot().archive.conversations[0].draft, "Keep a draft");
  const at = second.getSnapshot().archive.conversations[0].updatedAt;
  assert.equal(await second.remove(id, at), true);
  assert.equal(await first.update(id, item => { item.draft = "Must not resurrect"; }), false);
  await first.reload(); assert.equal(first.getSnapshot().archive.conversations.length, 0);
  assert.equal(parseChatArchive(database.read()!).conversations.length, 0);
});

test("unsupported newer database schema is refused without changing file contents", t => {
  const { path } = fixture(t);
  const sql = new DatabaseSync(path); sql.exec("PRAGMA user_version=99"); sql.close();
  const before = readFileSync(path);
  assert.throws(() => openChatDatabase(path), /newer V3/);
  assert.deepEqual(readFileSync(path), before);
});

test("a stopped SQLite file transfers to another folder with modes, drafts and deletion markers intact", () => {
  const root = join(process.cwd(), "work", `sqlite-transfer-${randomUUID()}`);
  const source = join(root, "source", "chats.sqlite"), destination = join(root, "destination with spaces", "chats.sqlite");
  mkdirSync(join(root, "destination with spaces"), { recursive: true });
  const first = openChatDatabase(source);
  first.write(archive(chat("keep", "finance"), chat("deleted")), null);
  first.remove("deleted", 100);
  const before = first.read(); first.close();
  copyFileSync(source, destination);
  const transferred = openChatDatabase(destination);
  try {
    assert.equal(transferred.read(), before);
    assert.equal(parseChatArchive(transferred.read()!).conversations[0].draft, "Unsent keep");
    assert.throws(() => transferred.write(archive(chat("keep", "finance"), chat("deleted")), before), /permanently deleted/);
  } finally {
    transferred.close();
    unlinkSync(source); unlinkSync(destination);
    rmdirSync(join(root, "source")); rmdirSync(join(root, "destination with spaces")); rmdirSync(root);
  }
  assert.equal(existsSync(root), false);
});
