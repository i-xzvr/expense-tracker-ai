import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { emptyWorkspace } from "../src/lib/accounting";
import { buildAccountantArchive, buildPrintableReport } from "../src/lib/accountant-package";

test("accountant ZIP keeps real receipt bytes, safe paths, exact totals and report metadata", () => {
  const workspace = emptyWorkspace();
  workspace.expenses = [{ id: "e1", date: "2026-10-01", amount: 12.50, category: "Food", description: "Lunch", createdAt: 1, merchant: "Cafe", project: "Client A", reimbursement: "pending", receiptId: "../receipt", reviewed: true }];
  workspace.receipts = [{ id: "../receipt", filename: "../../secret.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1, extracted: { amount: 12.50, date: "2026-10-02" } }];
  workspace.budgets = [{ month: "2026-10", category: "Food", amountCents: 2000 }];
  const files = unzipSync(buildAccountantArchive(workspace, "2026-10"));
  assert.deepEqual(Object.keys(files).sort(), ["README.txt", "expenses.csv", "receipts/1.png", "receipts/index.json", "report.html", "report.json"]);
  assert.deepEqual(files["receipts/1.png"], Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const report = JSON.parse(strFromU8(files["report.json"]));
  assert.equal(report.summary.totalCents, 1250);
  assert.equal(report.projects[0].pendingCents, 1250);
  assert.equal(report.receiptCoverage.dateDiscrepancies.length, 1);
  assert.equal(report.receipts[0].dataUrl, undefined);
  const index = JSON.parse(strFromU8(files["receipts/index.json"]));
  assert.deepEqual(index[0].expenseIds, ["e1"]);
  assert.equal(index[0].file, "receipts/1.png");
  assert.match(strFromU8(files["report.html"]), /Budget versus actual/);
  assert.match(strFromU8(files["report.html"]), /\$7\.50/);
  assert.match(strFromU8(files["report.html"]), /Receipt date differences/);
  assert.match(strFromU8(files["README.txt"]), /not a full workspace backup/);
});

test("printable handoff escapes user content and includes all accounting sections", () => {
  const workspace = emptyWorkspace();
  workspace.expenses = [{ id: "e1", date: "2026-10-01", amount: 0.1, category: "Other", description: "<script>alert(1)</script>", merchant: '<img src=x onerror="alert(1)">', project: "<svg/onload=alert(1)>", createdAt: 1 }];
  const html = buildPrintableReport(workspace, "2026-10");
  assert.doesNotMatch(html, /<script>|<img|<svg/);
  assert.match(html, /&lt;img/);
  assert.match(html, /\$0\.10/);
  assert.match(html, /Open period/);
  for (const section of ["Spending by category", "Expense register", "Budget versus actual", "Vendor spending", "Possible recurring charges", "Projects and reimbursements", "Receipt date differences", "Review findings", "Reconciliation"]) assert.ok(html.includes(section));
});

test("handoff includes previous-month and recurring evidence without inflating current totals", () => {
  const workspace = emptyWorkspace();
  workspace.expenses = ["2026-08-01", "2026-09-01", "2026-10-01"].map((date, index) => ({ id: "e" + index, date, amount: 10, category: "Bills", description: "Hosting subscription", merchant: "Hosting", createdAt: index }));
  const report = JSON.parse(strFromU8(unzipSync(buildAccountantArchive(workspace, "2026-10"))["report.json"]));
  assert.equal(report.summary.totalCents, 1000);
  assert.equal(report.summary.previousTotalCents, 1000);
  assert.equal(report.expenses.length, 1);
  assert.equal(report.supportingExpenses.length, 2);
  const evidence = new Set([...report.expenses, ...report.supportingExpenses].map((row: { id: string }) => row.id));
  for (const id of report.recurring[0].expenseIds) assert.ok(evidence.has(id));
});
