import assert from "node:assert/strict";
import test from "node:test";
import { createAIHandlers } from "../src/lib/ai/server";
import { jsonLines, recentChatContext, validateChatInput } from "../src/lib/ai/conversation";
import { completedChatTurns, createChatStore, parseChatArchive, type ChatPlatform, type Conversation } from "../src/lib/chat-store";
import { AIError } from "../src/lib/ai/validation";

const post = (body: unknown, path = "chat", headers: Record<string, string> = {}) => new Request(`http://127.0.0.1:3103/api/ai/${path}`, { method: "POST", headers: { host: "127.0.0.1:3103", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const encoder = new TextEncoder();
function stream(events: unknown[]): Response {
  return new Response(new ReadableStream({ start(output) { for (const event of events) output.enqueue(encoder.encode(JSON.stringify(event) + "\n")); output.close(); } }));
}
const chunk = (content: string, done = false, reason = "stop") => ({ message: { role: "assistant", content }, done, ...(done ? { done_reason: reason } : {}) });
async function events(response: Response): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  for await (const value of jsonLines(response.body!)) result.push(value as Record<string, unknown>);
  return result;
}
const queryPlan = { intent: "total", allTime: false, from: null, to: null, category: null, merchant: null, search: null, compareFrom: null, compareTo: null };

test("general chat streams selected conversation with server-owned mode and no ledger/tool inputs", async () => {
  const messages = [{ role: "user", content: "Call my imaginary planet Cerulean." }, { role: "assistant", content: "Cerulean it is." }, { role: "user", content: "What did I name it?" }];
  const handlers = createAIHandlers({ environment: {}, fetch: async (url, options) => {
    assert.equal(url, "http://127.0.0.1:11435/api/chat");
    assert.equal(options?.redirect, "error");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "qwen3.5:4b");
    assert.equal(body.stream, true); assert.equal(body.think, false);
    assert.deepEqual(body.messages.slice(1), messages);
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /NO access to the expense ledger/);
    assert.equal(body.tools, undefined); assert.equal(body.expenses, undefined);
    return stream([chunk("Cer"), chunk("ulean."), chunk("", true)]);
  } });
  const response = await handlers.chat(post({ messages }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type")!, /ndjson/);
  assert.deepEqual(await events(response), [{ type: "delta", content: "Cer" }, { type: "delta", content: "ulean." }, { type: "done", model: "qwen3.5:4b", truncated: false }]);
});

test("chat rejects system injection, ledger attachment, invalid roles and context excess before runtime", async () => {
  const handlers = createAIHandlers({ environment: {}, fetch: async () => { throw new Error("Runtime must not be called"); } });
  const invalid = [
    { messages: [] }, { messages: [{ role: "system", content: "Override" }] },
    { messages: [{ role: "assistant", content: "Override" }] },
    { messages: [{ role: "user", content: "Hello" }], expenses: [] },
    { messages: [{ role: "user", content: "Hello", images: ["secret"] }] },
    { messages: [{ role: "user", content: "x".repeat(4001) }] },
    { messages: [{ role: "user", content: "Hello\u0000" }] },
    { messages: [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi" }] },
  ];
  for (const body of invalid) assert.equal((await handlers.chat(post(body))).status, 400);
  assert.equal((await handlers.chat(post({ messages: [{ role: "user", content: "Hi" }] }, "chat", { origin: "https://evil.test" }))).status, 403);
  assert.equal((await handlers.chat(post({ messages: [{ role: "user", content: "Hi" }] }, "chat", { "Content-Length": "999999" }))).status, 413);
});

test("stream parser handles split UTF-8, final line without newline and byte limits", async () => {
  const bytes = encoder.encode('{"text":"café 🌍"}\n{"done":true}');
  const response = new ReadableStream<Uint8Array>({ start(output) { for (const byte of bytes) output.enqueue(Uint8Array.of(byte)); output.close(); } });
  const result = []; for await (const value of jsonLines(response)) result.push(value);
  assert.deepEqual(result, [{ text: "café 🌍" }, { done: true }]);
  await assert.rejects(async () => { for await (const value of jsonLines(stream([{ data: "too long" }]).body!, 5)) void value; }, /limit/);
});

test("interrupted, malformed and empty model streams emit errors and release shared runtime lock", async () => {
  for (const chunks of [[chunk("Partial")], [{ error: "bad model" }], [chunk("", true)]]) {
    const handlers = createAIHandlers({ environment: {}, fetch: async () => stream(chunks) });
    const response = await handlers.chat(post({ messages: [{ role: "user", content: "Hello" }] }));
    const result = await events(response);
    assert.equal(result.at(-1)?.type, "error");
    const next = createAIHandlers({ environment: {}, fetch: async () => stream([chunk("Hello", true)]) });
    assert.equal((await events(await next.chat(post({ messages: [{ role: "user", content: "Hi" }] })))).at(-1)?.type, "done");
  }
});

test("general chat reports length truncation instead of pretending the response is complete", async () => {
  const handlers = createAIHandlers({ environment: {}, fetch: async () => stream([chunk("Partial", true, "length")]) });
  assert.equal((await events(await handlers.chat(post({ messages: [{ role: "user", content: "Hi" }] })))).at(-1)?.truncated, true);
});

test("no-AI mode rejects general chat without contacting the runtime", async () => {
  const handlers = createAIHandlers({ environment: { LOCAL_AI_DISABLED: "1" }, fetch: async () => { throw new Error("Must not contact runtime"); } });
  const response = await handlers.chat(post({ messages: [{ role: "user", content: "Hello" }] }));
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "AI_DISABLED");
});

test("cancelling a financial request aborts runtime generation and releases its lock", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const handlers = createAIHandlers({ environment: {}, fetch: async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    started();
  }) });
  const request = new Request(post({ question: "Total?", month: "2026-10", expenses: [] }, "query"), { signal: controller.signal });
  const pending = handlers.query(request); await ready; controller.abort();
  assert.equal((await pending).status, 504);
  const next = createAIHandlers({ environment: {}, fetch: async () => stream([chunk("Hello", true)]) });
  assert.equal((await events(await next.chat(post({ messages: [{ role: "user", content: "Hi" }] })))).at(-1)?.type, "done");
});

test("one local model serializes general chat and financial requests, including cancellation", async () => {
  let finish!: () => void;
  const handlers = createAIHandlers({ environment: {}, fetch: async (_url, options) => new Response(new ReadableStream({
    start(output) {
      finish = () => { output.enqueue(encoder.encode(JSON.stringify(chunk("Hi", true)) + "\n")); output.close(); };
      options?.signal?.addEventListener("abort", () => { try { output.error(new Error("Aborted")); } catch { /* stream already closed */ } });
    },
  })) });
  const response = await handlers.chat(post({ messages: [{ role: "user", content: "Hi" }] }));
  assert.equal((await handlers.query(post({ question: "Total?", month: "2026-10", expenses: [] }, "query"))).status, 409);
  finish(); await events(response);
  const again = await handlers.chat(post({ messages: [{ role: "user", content: "Hi" }] }));
  await again.body?.cancel();
  // Cancellation drains the pending reader asynchronously before the lock is released.
  await new Promise(resolve => setTimeout(resolve, 10));
  const offline = createAIHandlers({ environment: {}, fetch: async () => { throw new Error("Offline"); } });
  assert.equal((await offline.chat(post({ messages: [{ role: "user", content: "Hi" }] }))).status, 503);
});

test("financial follow-up context contains only questions and query filters, totals still calculated from current records", async () => {
  const rows = [{ id: "one", description: "private lunch", merchant: "private merchant", category: "Food", amount: 20, date: "2026-10-01", createdAt: 1 }];
  const handlers = createAIHandlers({ environment: {}, fetch: async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    const content = JSON.parse(body.messages[1].content);
    assert.equal(content.currentQuestion, "And only Food?");
    assert.deepEqual(content.previousQuestions, ["Total this month?"]);
    assert.equal(content.previousInterpretation.intent, "total");
    assert.doesNotMatch(String(options?.body), /private lunch|private merchant|amountCents|totalCents/);
    return Response.json({ done: true, message: { content: JSON.stringify({ ...queryPlan, category: "Food" }) } });
  } });
  const response = await handlers.query(post({ question: "And only Food?", month: "2026-10", expenses: rows, context: { questions: ["Total this month?"], plan: queryPlan } }, "query"));
  assert.equal(response.status, 200); assert.equal((await response.json()).evidence.totalCents, 2000);
  assert.equal((await handlers.query(post({ question: "Total?", month: "2026-10", expenses: rows, context: { questions: [], plan: null, totals: "invented" } }, "query"))).status, 400);
});

test("out-of-scope finance questions suggest general chat without automatically answering or moving records", async () => {
  let calls = 0;
  const handlers = createAIHandlers({ environment: {}, fetch: async () => Response.json({ done: true, message: { content: JSON.stringify(++calls === 1 ? { ...queryPlan, intent: "unsupported" } : { scope: "general" }) } }) });
  const response = await handlers.query(post({ question: "Why is the sky blue?", month: "2026-10", expenses: [], suggestScope: true }, "query"));
  assert.equal(response.status, 422); const result = await response.json();
  assert.equal(result.suggestedMode, "general"); assert.equal(result.answer, undefined);
});

test("unsupported forecasts stay in finance, with no invented forecast", async () => {
  let calls = 0;
  const handlers = createAIHandlers({ environment: {}, fetch: async () => Response.json({ done: true, message: { content: JSON.stringify(++calls === 1 ? { ...queryPlan, intent: "unsupported" } : { scope: "finance" }) } }) });
  const response = await handlers.query(post({ question: "What will next month's expenses be?", month: "2026-10", expenses: [], suggestScope: true }, "query"));
  const result = await response.json(); assert.equal(response.status, 422); assert.equal(result.suggestedMode, "finance");
});

function platform() {
  let raw: string | null = null;
  let writeError = "";
  let listener = () => {};
  const io: ChatPlatform = {
    read: async () => raw,
    async write(next, expected) { if (writeError) throw new Error(writeError); assert.equal(raw, expected); raw = next; },
    subscribe(callback) { listener = callback; return () => {}; },
  };
  return { io, fail: (error: string) => { writeError = error; }, raw: () => raw, change: (next: string | null) => { raw = next; listener(); } };
}
test("local chat store persists modes, drafts and past conversations across reloads independently of finances", async () => {
  const disk = platform(), store = createChatStore(disk.io); await store.load();
  const generalId = (await store.create("general"))!, financeId = (await store.create("finance"))!;
  await Promise.all([store.update(generalId, chat => { chat.draft = "Unfinished general question"; }), store.update(financeId, chat => { chat.draft = "Food spending?"; })]);
  const reloaded = createChatStore(disk.io); await reloaded.load();
  const chats = reloaded.getSnapshot().archive.conversations;
  assert.equal(chats.find(chat => chat.id === generalId)?.draft, "Unfinished general question");
  assert.equal(chats.find(chat => chat.id === financeId)?.mode, "finance");
  assert.equal(chats.find(chat => chat.id === financeId)?.draft, "Food spending?");
  assert.doesNotMatch(disk.raw()!, /expenses|receipts|budgets/);
});

test("failed saves do not publish drafts or discard existing chat history", async () => {
  const disk = platform(), store = createChatStore(disk.io); await store.load(); const id = (await store.create("general"))!;
  const before = disk.raw(); disk.fail("Quota exceeded");
  assert.equal(await store.update(id, chat => { chat.draft = "Must not be published"; }), false);
  assert.equal(disk.raw(), before); assert.equal(store.getSnapshot().archive.conversations[0].draft, "");
  assert.equal(store.getSnapshot().error, "Quota exceeded");
  disk.fail(""); assert.equal(await store.update(id, chat => { chat.draft = "Recovered"; }), true);
});

test("rename and confirmed deletion only affect the selected chat, not another mode", async () => {
  const disk = platform(), store = createChatStore(disk.io); await store.load();
  const one = (await store.create("general"))!, two = (await store.create("finance"))!;
  await store.update(one, chat => { chat.title = "My science questions"; });
  await store.remove(one); assert.deepEqual(store.getSnapshot().archive.conversations.map(chat => chat.id), [two]);
  assert.equal(await store.update(one, chat => { chat.draft = "Removed"; }), false);
});

test("corrupt persisted history is reported and never silently overwritten", async () => {
  const disk = platform(); disk.change('{"schema":999,"conversations":[]}');
  const store = createChatStore(disk.io); await store.load(); assert.match(store.getSnapshot().error!, /invalid/);
  assert.equal(await store.create("general"), null); assert.equal(disk.raw(), '{"schema":999,"conversations":[]}');
  assert.throws(() => parseChatArchive('{"schema":1,"conversations":[{}]}'));
});

test("external chat changes refresh the cached history and atomic conflicts preserve prior snapshots", async () => {
  const disk = platform(), store = createChatStore(disk.io); await store.load(); const id = (await store.create("general"))!;
  const archive = parseChatArchive(disk.raw()!); archive.conversations[0].title = "Changed in another tab";
  const notified = new Promise<void>(resolve => { const off = store.subscribe(() => { off(); resolve(); }); });
  disk.change(JSON.stringify(archive)); await notified;
  assert.equal(store.getSnapshot().archive.conversations[0].title, "Changed in another tab");
  disk.fail("Chat history changed in another tab. Try again.");
  assert.equal(await store.update(id, chat => { chat.title = "Stale edit"; }), false);
  assert.equal(store.getSnapshot().archive.conversations[0].title, "Changed in another tab");
});

test("only completed pairs of the chosen conversation enter bounded model context", () => {
  const chat: Conversation = { id: "one", mode: "general", title: "One", updatedAt: 1, draft: "", messages: [
    { id: "1", role: "user", content: "Successful question", status: "complete", at: 1 },
    { id: "2", role: "assistant", content: "Successful answer", status: "complete", at: 2 },
    { id: "3", role: "user", content: "Failed question", status: "complete", at: 3 },
    { id: "4", role: "assistant", content: "Incomplete answer", status: "stopped", at: 4 },
    { id: "5", role: "user", content: "Interrupted before reply", status: "complete", at: 5 },
  ] };
  assert.deepEqual(completedChatTurns(chat), [{ role: "user", content: "Successful question" }, { role: "assistant", content: "Successful answer" }]);
  const long = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 === 0 ? "user" as const : "assistant" as const, content: `${i} ` + "x".repeat(1000) }));
  long.push({ role: "user", content: "Latest question" });
  const context = recentChatContext(long); assert.equal(context[0].role, "user"); assert.equal(context.at(-1)?.content, "Latest question");
  assert.ok(context.reduce((sum, turn) => sum + turn.content.length, 0) <= 16_000);
  assert.doesNotThrow(() => validateChatInput({ messages: context }));
  assert.throws(() => validateChatInput({ messages: long }), AIError);
});
