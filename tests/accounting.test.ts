import assert from "node:assert/strict";
import test from "node:test";
import type { AccountingExpense, BankStatement, Workspace } from "../src/types/accounting";
import { buildAccountingReport, buildAccountantHandoff, buildHandoffCsv, emptyWorkspace, exportWorkspaceBackup, parseStatementCsv, parseWorkspaceBackup, reconcileStatement, validateWorkspace } from "../src/lib/accounting";

const expense = (input: Partial<AccountingExpense> = {}): AccountingExpense => ({ id: "expense-1", date: "2026-10-01", amount: 12.34, category: "Food", description: "Lunch meeting", createdAt: 1_790_000_000_000, merchant: "Cafe", account: "Checking", ...input });
const workspace = (input: Partial<Workspace> = {}): Workspace => ({ ...emptyWorkspace(), expenses: [expense()], ...input });
const statement = (input: Partial<BankStatement> = {}): BankStatement => ({ id: "statement-1", account: "Checking", startDate: "2026-10-01", endDate: "2026-10-31", openingCents: 10_000, closingCents: 8_766, lines: [{ id: "line-1", date: "2026-10-01", description: "Cafe", amountCents: -1234, expenseId: "expense-1" }], ...input });

test("reports use exact cents, include previous month/year and remain detached", () => {
  const source = workspace({ expenses: [expense({ id: "a", date: "2026-01-01", amount: 0.1 }), expense({ id: "b", date: "2026-01-03", amount: 0.2, category: "Bills" }), expense({ id: "c", date: "2025-12-31", amount: 0.5 })] });
  const report = buildAccountingReport(source, "2026-01");
  assert.equal(report.summary.totalCents, 30); assert.equal(report.summary.count, 2);
  assert.equal(report.summary.previousMonth, "2025-12"); assert.equal(report.summary.previousTotalCents, 50); assert.equal(report.summary.changeCents, -20);
  assert.equal(report.summary.categoryTotals.find((c) => c.category === "Bills")?.totalCents, 20);
  report.expenses[0].description = "Changed";
  assert.equal(source.expenses[0].description, "Lunch meeting");
  assert.throws(() => buildAccountingReport(source, "2026-13"), /valid/);
});

test("cleanup records evidence IDs without automatically treating suggestions as errors", () => {
  const report = buildAccountingReport(workspace({ expenses: [expense({ id: "a", description: "x", category: "Other" }), expense({ id: "b", description: "x", category: "Other", reviewed: true })] }), "2026-10");
  assert.deepEqual(report.cleanup.find((f) => f.type === "duplicate")?.expenseIds, ["a", "b"]);
  assert.equal(report.cleanup.filter((f) => f.type === "description").length, 2);
  assert.equal(report.cleanup.filter((f) => f.type === "unreviewed").length, 1);
  assert.equal(report.cleanup.filter((f) => f.type === "category").length, 2);
});

test("receipt coverage identifies missing evidence and amount differences", () => {
  const source = workspace({ expenses: [expense({ receiptId: "receipt-1" }), expense({ id: "b", amount: 3 })], receipts: [{ id: "receipt-1", filename: "receipt.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1, extracted: { amount: 12.35, date: "2026-10-02" } }] });
  const report = buildAccountingReport(source, "2026-10");
  assert.equal(report.receiptCoverage.attached, 1); assert.equal(report.receiptCoverage.missing, 1);
  assert.deepEqual(report.receiptCoverage.missingExpenseIds, ["b"]);
  assert.deepEqual(report.receiptCoverage.discrepancies, [{ expenseId: "expense-1", receiptId: "receipt-1", expectedCents: 1234, receiptCents: 1235 }]);
  assert.deepEqual(report.receiptCoverage.dateDiscrepancies, [{ expenseId: "expense-1", receiptId: "receipt-1", expectedDate: "2026-10-01", receiptDate: "2026-10-02" }]);
});

test("budgets, normalized merchants, and project reimbursement totals are exact", () => {
  const source = workspace({ expenses: [expense({ id: "a", amount: 10, merchant: " Cafe ", project: "Client A", reimbursement: "pending" }), expense({ id: "b", amount: 15, merchant: "cafe", project: "client a", reimbursement: "paid" })], budgets: [{ month: "2026-10", category: "Food", amountCents: 2000 }] });
  const report = buildAccountingReport(source, "2026-10");
  assert.deepEqual(report.budgets, [{ category: "Food", budgetCents: 2000, actualCents: 2500, remainingCents: -500 }]);
  assert.equal(report.merchants.length, 1); assert.equal(report.merchants[0].totalCents, 2500);
  assert.equal(report.projects.length, 1); assert.equal(report.projects[0].pendingCents, 1000); assert.equal(report.projects[0].paidCents, 1500);
});

test("recurring suggestions require multiple real intervals and report observed price changes", () => {
  const regular = [expense({ id: "a", date: "2026-08-01", amount: 9 }), expense({ id: "b", date: "2026-09-01", amount: 9 }), expense({ id: "c", date: "2026-10-01", amount: 11 })];
  const report = buildAccountingReport(workspace({ expenses: regular }), "2026-10");
  assert.equal(report.recurring[0].interval, "monthly"); assert.equal(report.recurring[0].changeCents, 200); assert.deepEqual(report.recurring[0].expenseIds, ["a", "b", "c"]);
  assert.equal(buildAccountingReport(workspace({ expenses: regular.slice(1) }), "2026-10").recurring.length, 0);
  assert.equal(buildAccountingReport(workspace({ expenses: regular.map((e) => ({ ...e, date: "2026-10-01" })) }), "2026-10").recurring.length, 0);
  assert.equal(buildAccountingReport(workspace({ expenses: regular }), "2026-11").recurring.length, 0);
});

test("reconciliation verifies signed balances plus all expense and transaction matches", () => {
  const s = statement(); const source = workspace({ statements: [s] });
  assert.equal(reconcileStatement(source, s).status, "reconciled");
  assert.equal(reconcileStatement(source, { ...s, closingCents: 8765 }).differenceCents, -1);
  assert.equal(reconcileStatement(source, { ...s, closingCents: 8765 }).status, "needs-review");
  const extra = workspace({ ...source, expenses: [...source.expenses, expense({ id: "unrecorded", date: "2026-10-02", amount: 20 })] });
  assert.deepEqual(reconcileStatement(extra, s).unmatchedExpenseIds, ["unrecorded"]);
  assert.equal(reconcileStatement(extra, s).status, "needs-review");
  const incomeStatement = statement({ closingCents: 9766, lines: [...s.lines, { id: "income", date: "2026-10-03", description: "Deposit", amountCents: 1000, classification: "income" }] });
  assert.equal(reconcileStatement(workspace({ statements: [incomeStatement] }), incomeStatement).status, "reconciled");
});

test("reconciliation never reports orphan, multiply linked, wrong account, or wrong date as matched", () => {
  const s = statement();
  assert.equal(reconcileStatement(workspace({ statements: [s], expenses: [] }), s).status, "needs-review");
  const twice = statement({ lines: [...s.lines, { ...s.lines[0], id: "line-2" }], closingCents: 7532 });
  assert.deepEqual(reconcileStatement(workspace({ statements: [twice] }), twice).invalidLineIds, ["line-1", "line-2"]);
  assert.equal(reconcileStatement(workspace({ statements: [s], expenses: [expense({ account: "Savings" })] }), s).matchedCount, 0);
  assert.equal(reconcileStatement(workspace({ statements: [s], expenses: [expense({ date: "2026-10-02" })] }), s).matchedCount, 0);
});

test("CSV supports BOM, CRLF, commas, doubled quotes and embedded newlines", () => {
  assert.deepEqual(parseStatementCsv('\uFEFFDate,Description,Amount\r\n2026-10-01,"Cafe, ""Lunch""",-12.34\r\n2026-10-02,"Refund\nreceived",0.10\r\n'), [
    { date: "2026-10-01", description: 'Cafe, "Lunch"', amountCents: -1234 }, { date: "2026-10-02", description: "Refund\nreceived", amountCents: 10 },
  ]);
});

test("CSV fails loudly on ambiguous amounts, bad dates, malformed quoting, and missing columns", () => {
  for (const raw of ["Date,Description,Amount\n2026-02-30,Cafe,-10", "Date,Description,Amount\n2026-10-01,Cafe,-1.234", "Date,Description,Amount\n2026-10-01,Cafe,1e3", "Date,Description,Amount\n2026-10-01,Cafe,0", 'Date,Description,Amount\n2026-10-01,"Cafe,-10', 'Date,Description,Amount\n2026-10-01,"Cafe"x,-10', "Date,Description,Amount\n2026-10-01,Cafe", "Date,Amount,Description\n2026-10-01,-10,Cafe"]) assert.throws(() => parseStatementCsv(raw));
});

test("backup validation rejects invalid references, IDs, amounts, balances, dates and duplicate imports", () => {
  assert.equal(validateWorkspace(workspace()).expenses[0].id, "expense-1");
  const invalid: Workspace[] = [workspace({ expenses: [expense(), expense()] }), workspace({ expenses: [expense({ amount: -1 })] }), workspace({ expenses: [expense({ amount: 1.001 })] }), workspace({ expenses: [expense({ date: "2026-02-30" })] }), workspace({ expenses: [expense({ receiptId: "missing" })] }), workspace({ statements: [statement({ openingCents: 0.5 })] }), workspace({ statements: [statement(), statement({ id: "duplicate", lines: [{ ...statement().lines[0], id: "line-2", expenseId: undefined }] })] })];
  for (const value of invalid) assert.throws(() => validateWorkspace(value));
  assert.throws(() => validateWorkspace(workspace({ statements: [statement({ lines: [{ ...statement().lines[0], amountCents: -1235 }] })] })), /exactly/);
  assert.throws(() => parseWorkspaceBackup("[]"), /object/);
  assert.throws(() => parseWorkspaceBackup("{broken"), /JSON/);
  assert.throws(() => parseWorkspaceBackup(JSON.stringify({ ...workspace(), unexpected: "hidden field" })), /unsupported field/);
});

test("handoff contains receipt evidence and history, and CSV cells cannot execute formulas", () => {
  const source = workspace({ expenses: [expense({ description: '=HYPERLINK("bad")', receiptId: "receipt-1" })], receipts: [{ id: "receipt-1", filename: "receipt.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }], audit: [{ id: "audit-1", at: 1, action: "expense.add", detail: "Added" }] });
  const handoff = buildAccountantHandoff(source, "2026-10");
  assert.equal(handoff.receipts[0].dataUrl, source.receipts[0].dataUrl); assert.equal(handoff.audit.length, 1);
  assert.match(buildHandoffCsv(source, "2026-10"), /'=HYPERLINK/);
  assert.deepEqual(parseWorkspaceBackup(exportWorkspaceBackup(source)), source);
  handoff.receipts[0].filename = "changed"; assert.equal(source.receipts[0].filename, "receipt.png");
});
