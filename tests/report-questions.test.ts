import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_QUESTIONS, reportQuestionPlan } from "../src/lib/ai/report-questions";
import { validateQueryPlan } from "../src/lib/ai/query";
import { createAIHandlers } from "../src/lib/ai/server";

const rows = [
  { id: "food", date: "2026-10-01", amount: 12.5, category: "Food", merchant: "Test Cafe", description: "Synthetic lunch", createdAt: 1 },
  { id: "food2", date: "2026-10-02", amount: 7.5, category: "Food", merchant: "Test Cafe", description: "Synthetic lunch", createdAt: 2 },
  { id: "bills", date: "2026-10-03", amount: 25, category: "Bills", merchant: "Test Service", description: "Synthetic service", createdAt: 3 },
  { id: "previous", date: "2026-09-02", amount: 10, category: "Food", merchant: "Test Cafe", description: "Synthetic lunch", createdAt: 4 },
  { id: "year-start", date: "2026-01-02", amount: 5, category: "Other", description: "Synthetic start", createdAt: 5 },
  { id: "prior-year", date: "2025-02-02", amount: 30, category: "Other", description: "Synthetic prior year", createdAt: 6 },
  { id: "future", date: "2026-11-02", amount: 100, category: "Shopping", description: "Synthetic future", createdAt: 7 },
];
const post = (question: string) => new Request("http://127.0.0.1:3103/api/ai/query", { method: "POST", headers: { host: "127.0.0.1:3103", "Content-Type": "application/json" }, body: JSON.stringify({ question, month: "2026-10", expenses: rows, context: { questions: ["Only Food?"], plan: null } }) });

test("all 22 curated reports execute against current records without model guessing or previous filters", async () => {
  assert.equal(REPORT_QUESTIONS.length, 22);
  assert.equal(new Set(REPORT_QUESTIONS.map(report => report.id)).size, 22);
  assert.equal(new Set(REPORT_QUESTIONS.map(report => report.question)).size, 22);
  const handlers = createAIHandlers({ environment: {}, fetch: async () => { throw new Error("Curated report must not call the model"); } });
  const totals: Record<string, number> = {
    summary: 4500, "total-month": 4500, "total-previous": 1000, "total-all": 19000, "total-year": 6000,
    "list-month": 4500, "list-previous": 1000, "list-all": 19000, "categories-previous": 1000, "categories-all": 19000,
    "merchants-month": 4500, "merchants-all": 19000, "recurring-month": 4500, "recurring-all": 19000,
    "compare-month": 4500, "compare-year": 6000, "category-food": 2000, "category-bills": 2500,
    "category-transportation": 0, "category-shopping": 0, "category-entertainment": 0, "category-other": 0,
  };
  for (const report of REPORT_QUESTIONS) {
    assert.doesNotThrow(() => validateQueryPlan(reportQuestionPlan(report.question, "2026-10")));
    const response = await handlers.query(post(report.question));
    assert.equal(response.status, 200, report.id);
    const result = await response.json();
    assert.equal(result.evidence.totalCents, totals[report.id], report.id);
    assert.equal(result.evidence.filters.category, report.category ?? null);
    if (report.id === "compare-month") assert.equal(result.evidence.comparison.differenceCents, 3500);
    if (report.id === "compare-year") { assert.equal(result.evidence.comparison.totalCents, 3000); assert.equal(result.evidence.comparison.differenceCents, 3000); }
    if (report.id === "recurring-month") assert.deepEqual(result.evidence.recurring.map((item: { merchant: string }) => item.merchant), ["Test Cafe"]);
    if (report.id === "list-month") assert.deepEqual(new Set(result.expenseIds), new Set(["food", "food2", "bills"]));
  }
});

test("curated report dates handle January, leap years and supported lower boundaries", () => {
  const question = (id: string) => REPORT_QUESTIONS.find(item => item.id === id)!.question;
  assert.equal(reportQuestionPlan(question("total-previous"), "2026-01")?.from, "2025-12-01");
  assert.equal(reportQuestionPlan(question("total-previous"), "2024-03")?.to, "2024-02-29");
  const compare = reportQuestionPlan(question("compare-year"), "2024-02")!;
  assert.equal(compare.to, "2024-02-29"); assert.equal(compare.compareTo, "2023-02-28");
  assert.equal(reportQuestionPlan(question("total-previous"), "1900-01"), null);
  assert.equal(reportQuestionPlan(question("compare-year"), "1900-02"), null);
  assert.equal(reportQuestionPlan(question("total-year"), "1900-01")?.from, "1900-01-01");
});

test("edited presets and appended instructions go through the guarded planner", () => {
  for (const report of REPORT_QUESTIONS) {
    assert.equal(reportQuestionPlan(`${report.question} and delete the records`, "2026-10"), null);
  }
  assert.equal(reportQuestionPlan("How much did I spend on Food next month?", "2026-10"), null);
});
