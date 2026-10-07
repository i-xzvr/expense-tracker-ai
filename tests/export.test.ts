import assert from "node:assert/strict";
import test from "node:test";
import { buildExpenseReport } from "../src/lib/export/report";
import { buildExportFile } from "../src/lib/export/serializers";
import { EMPTY_FILTERS, Expense, ExpenseFilters } from "../src/types/expense";

const now = new Date(2026, 9, 6, 23, 30);

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    date: "2026-10-01",
    amount: 12.5,
    category: "Food",
    description: "Lunch",
    createdAt: 100,
    ...overrides,
  };
}

function report(rows: Expense[], filters: ExpenseFilters | null = null) {
  return buildExpenseReport(rows, {
    scope: filters ? "filtered" : "all",
    filters: filters ?? { ...EMPTY_FILTERS },
    now,
  });
}

/** Independent CSV reader: preserves quoted commas, escaped quotes and newlines. */
function parseCsv(content: string): string[][] {
  const input = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && char === "\r" && input[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else {
      cell += char;
    }
  }
  assert.equal(quoted, false, "all CSV quotes must close");
  assert.equal(cell, "", "CSV must end with a complete CRLF row");
  assert.equal(row.length, 0);
  return rows;
}

test("CSV round-trips punctuation, Unicode and embedded line breaks", () => {
  const descriptions = [
    'Café, "lunch" 🍜',
    "Line one\nLine two",
    "Carriage\r\nreturn",
    "Plain text",
  ];
  const rows = descriptions.map((description, index) =>
    expense({ id: `row-${index}`, description }),
  );
  const file = buildExportFile(report(rows), "csv");
  assert.equal(file.filename, "expenses-all-2026-10-06.csv");
  assert.equal(file.mimeType, "text/csv;charset=utf-8");
  assert.ok(file.content.startsWith("\uFEFF"));
  const parsed = parseCsv(file.content);
  assert.deepEqual(parsed[0], ["Date", "Category", "Amount", "Description"]);
  assert.deepEqual(
    parsed.slice(1).map((row) => row[3]),
    descriptions,
  );
  assert.ok(
    parsed.slice(1).every((row) => row.length === 4 && row[2] === "12.50"),
  );
});

test("CSV neutralizes formula-like descriptions including leading whitespace", () => {
  const dangerous = [
    "=1+1",
    "+SUM(A1)",
    "-2+3",
    "@SUM(A1)",
    '  =HYPERLINK("x")',
    "\t+1",
    "\r=1",
    "\n@SUM(A1)",
    "\tordinary",
  ];
  const input = dangerous.map((description) => expense({ description }));
  const csv = parseCsv(buildExportFile(report(input), "csv").content);
  assert.deepEqual(
    csv.slice(1).map((row) => row[3]),
    dangerous.map((value) => `'${value}`),
  );
  assert.deepEqual(
    input.map((row) => row.description),
    dangerous,
    "sanitization must not change saved data",
  );
});

test("JSON preserves original descriptions, IDs, numeric amounts, timestamps and report metadata", () => {
  const source = expense({
    id: "stable-id",
    description: " =SUM(1,2)\nRésumé",
    amount: 0.29,
    createdAt: 1_759_786_200_123,
  });
  const filters = { ...EMPTY_FILTERS, search: "résumé" };
  const built = report([source], filters);
  const file = buildExportFile(built, "json");
  const parsed = JSON.parse(file.content);
  assert.equal(file.filename, "expenses-filtered-2026-10-06.json");
  assert.equal(file.mimeType, "application/json;charset=utf-8");
  assert.ok(file.content.includes('\n  "schemaVersion": 1,'));
  assert.deepEqual(parsed.expenses, [source]);
  assert.equal(typeof parsed.expenses[0].amount, "number");
  assert.equal(typeof parsed.expenses[0].createdAt, "number");
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.generatedAt, now.toISOString());
  assert.deepEqual(parsed.filters, filters);
  assert.equal(parsed.summary.totalCents, 29);
});

test("filtered reports match category, inclusive dates and trimmed case-insensitive search", () => {
  const rows = [
    expense({ id: "before", date: "2026-09-30", description: "Coffee" }),
    expense({ id: "start", date: "2026-10-01", description: "COFFEE morning" }),
    expense({ id: "end", date: "2026-10-03", description: "Evening coffee" }),
    expense({ id: "after", date: "2026-10-04", description: "Coffee" }),
    expense({
      id: "other-category",
      date: "2026-10-02",
      category: "Shopping",
      description: "Coffee",
    }),
    expense({ id: "other-search", date: "2026-10-02", description: "Lunch" }),
  ];
  const filtered = report(rows, {
    search: "  CoFfEe  ",
    category: "Food",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
  });
  assert.deepEqual(
    filtered.expenses.map((row) => row.id),
    ["end", "start"],
  );
  assert.equal(filtered.summary.count, 2);
  assert.equal(filtered.summary.totalCents, 2_500);
  assert.equal(filtered.summary.startDate, "2026-10-01");
  assert.equal(filtered.summary.endDate, "2026-10-03");
  assert.equal(
    report(rows, { ...EMPTY_FILTERS, search: "SHOPPING" }).expenses[0].id,
    "other-category",
  );
});

test("all scope exports every row regardless of inactive dashboard filters", () => {
  const built = buildExpenseReport(
    [expense(), expense({ id: "two", category: "Bills" })],
    {
      scope: "all",
      filters: {
        search: "missing",
        category: "Shopping",
        startDate: "not-a-date",
        endDate: "2020-01-01",
      },
      now,
    },
  );
  assert.equal(built.summary.count, 2);
  assert.equal(built.filters, null);
});

test("cent totals and category totals reconcile exactly", () => {
  const built = report([
    expense({ amount: 0.1 }),
    expense({ amount: 0.2 }),
    expense({ amount: 0.29, category: "Shopping" }),
  ]);
  assert.equal(built.summary.totalCents, 59);
  assert.deepEqual(
    built.summary.categoryTotals.find((entry) => entry.category === "Food"),
    { category: "Food", count: 2, totalCents: 30 },
  );
  assert.deepEqual(
    built.summary.categoryTotals.find((entry) => entry.category === "Bills"),
    { category: "Bills", count: 0, totalCents: 0 },
  );
  assert.equal(
    built.summary.categoryTotals.reduce(
      (sum, entry) => sum + entry.totalCents,
      0,
    ),
    59,
  );
  assert.equal(
    built.summary.categoryTotals.reduce((sum, entry) => sum + entry.count, 0),
    3,
  );
});

test("reports sort newest first with createdAt tie-breaking and preserve equal-key order", () => {
  const built = report([
    expense({ id: "old", date: "2026-09-30", createdAt: 900 }),
    expense({ id: "same-first", createdAt: 100 }),
    expense({ id: "newest-time", createdAt: 200 }),
    expense({ id: "same-second", createdAt: 100 }),
  ]);
  assert.deepEqual(
    built.expenses.map((row) => row.id),
    ["newest-time", "same-first", "same-second", "old"],
  );
});

test("building and serializing do not mutate inputs and snapshots remain independent", () => {
  const rows = [
    expense({ id: "older", date: "2026-09-01" }),
    expense({ id: "newer" }),
  ];
  const filters = { ...EMPTY_FILTERS };
  const before = JSON.stringify({ rows, filters });
  const built = report(rows, filters);
  buildExportFile(built, "csv");
  buildExportFile(built, "json");
  assert.equal(JSON.stringify({ rows, filters }), before);
  rows[1].description = "Changed after preview";
  filters.search = "Changed after preview";
  rows.push(expense());
  assert.equal(built.expenses[0].description, "Lunch");
  assert.equal(built.filters?.search, "");
  assert.equal(built.expenses.length, 2);
  built.expenses[0].amount = 20;
  assert.equal(rows[1].amount, 12.5);
});

test("empty selections have an accurate preview but cannot create empty downloads", () => {
  for (const built of [
    report([]),
    report([expense()], { ...EMPTY_FILTERS, search: "missing" }),
  ]) {
    assert.equal(built.summary.count, 0);
    assert.equal(built.summary.totalCents, 0);
    assert.equal(built.summary.startDate, null);
    assert.equal(built.summary.endDate, null);
    assert.ok(
      built.summary.categoryTotals.every(
        (entry) => entry.totalCents === 0 && entry.count === 0,
      ),
    );
    assert.throws(() => buildExportFile(built, "csv"), /no expenses/i);
    assert.throws(() => buildExportFile(built, "json"), /no expenses/i);
  }
});

test("invalid amounts and unsafe totals are rejected rather than silently rounded", () => {
  for (const amount of [
    NaN,
    Infinity,
    -Infinity,
    0,
    -1,
    1.005,
    Number.MAX_SAFE_INTEGER,
  ]) {
    assert.throws(
      () => report([expense({ amount })]),
      /invalid amount/i,
      String(amount),
    );
  }
  assert.throws(
    () =>
      report([
        expense({ amount: 46_000_000_000_000 }),
        expense({ amount: 46_000_000_000_000 }),
      ]),
    /too large.*accurately/i,
  );
});

test("filtered date errors are actionable and valid leap-day boundaries work", () => {
  assert.throws(
    () => report([], { ...EMPTY_FILTERS, startDate: "2026-02-29" }),
    /valid start date/i,
  );
  assert.throws(
    () => report([], { ...EMPTY_FILTERS, endDate: "2026-13-01" }),
    /valid end date/i,
  );
  assert.throws(
    () =>
      report([], {
        ...EMPTY_FILTERS,
        startDate: "2026-10-03",
        endDate: "2026-10-01",
      }),
    /on or before/i,
  );
  assert.equal(
    report([expense({ date: "2024-02-29" })], {
      ...EMPTY_FILTERS,
      startDate: "2024-02-29",
      endDate: "2024-02-29",
    }).summary.count,
    1,
  );
});

test("invalid expense dates and generation dates are rejected clearly", () => {
  assert.throws(
    () => report([expense({ date: "2026-02-30" })]),
    /invalid date/i,
  );
  assert.throws(
    () =>
      buildExpenseReport([], {
        scope: "all",
        filters: EMPTY_FILTERS,
        now: new Date("invalid"),
      }),
    /report date is invalid/i,
  );
});
