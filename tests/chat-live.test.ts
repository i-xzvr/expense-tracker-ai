/** Opt in after Setup-V3 / Start-V3. Uses synthetic questions and expenses only. */
import assert from "node:assert/strict";
import test from "node:test";
import { createAIHandlers } from "../src/lib/ai/server";
import { jsonLines } from "../src/lib/ai/conversation";
import type { QueryResponse } from "../src/lib/ai/types";

const live = process.env.RUN_LOCAL_AI_TESTS === "1";
const post = (body: unknown, route: string) => new Request(`http://127.0.0.1:3103/api/ai/${route}`, { method: "POST", headers: { host: "127.0.0.1:3103", "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("LIVE conversation remembers selected general chat, keeps personal finance bounded and resolves financial follow-ups", { skip: !live, timeout: 600_000 }, async t => {
  const handlers = createAIHandlers();
  async function general(messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
    const response = await handlers.chat(post({ messages }, "chat"));
    assert.equal(response.status, 200);
    let content = "", done = false;
    for await (const event of jsonLines(response.body!)) {
      const value = event as { type: string; content?: string; error?: string };
      assert.notEqual(value.type, "error", value.error);
      if (value.type === "delta") content += value.content;
      if (value.type === "done") done = true;
    }
    assert.ok(done); return content;
  }
  const answer = await general([{ role: "user", content: "My fictional planet is named Cerulean. Acknowledge this in one short sentence." }]);
  const recalled = await general([{ role: "user", content: "My fictional planet is named Cerulean. Acknowledge this in one short sentence." }, { role: "assistant", content: answer }, { role: "user", content: "What did I name my fictional planet? Answer with the name only." }]);
  assert.match(recalled, /Cerulean/i); t.diagnostic(`General follow-up: ${recalled}`);
  const noLedger = await general([{ role: "user", content: "Check my expense records and tell me exactly how much I spent this month." }]);
  assert.match(noLedger, /finance|expense.*assistant|no.*access|cannot.*access|don't have access/i);
  assert.doesNotMatch(noLedger, /\$\d/); t.diagnostic(`General personal-finance boundary: ${noLedger}`);

  const expenses = [
    { id: "food-now", date: "2026-10-01", description: "Synthetic lunch", category: "Food", amount: 12.5, createdAt: 1 },
    { id: "bills-now", date: "2026-10-03", description: "Synthetic service", category: "Bills", amount: 25, createdAt: 2 },
    { id: "food-before", date: "2026-09-01", description: "Synthetic lunch", category: "Food", amount: 10, createdAt: 3 },
  ];
  const context = { questions: ["How much did I spend on Food this month?"], plan: { intent: "total", allTime: false, from: "2026-10-01", to: "2026-10-31", category: "Food", merchant: null, search: null, compareFrom: null, compareTo: null } };
  const response = await handlers.query(post({ question: "And last month?", month: "2026-10", expenses, context }, "query"));
  const result = await response.json() as QueryResponse;
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.evidence.totalCents, 1000); assert.equal(result.evidence.filters.category, "Food");
  assert.deepEqual(result.expenseIds, ["food-before"]); t.diagnostic(`Financial follow-up: ${result.answer}`);
  for (const item of [{ question: "Why is the sky blue?", mode: "general" }, { question: "What will my expenses be next month?", mode: "finance" }]) {
    const response = await handlers.query(post({ question: item.question, month: "2026-10", expenses, suggestScope: true }, "query"));
    const result = await response.json();
    assert.equal(response.status, 422, JSON.stringify(result)); assert.equal(result.suggestedMode, item.mode);
    t.diagnostic(`${item.question} -> ${result.suggestedMode}`);
  }
});
