import { strToU8, zipSync } from "fflate";
import type { Workspace } from "@/types/accounting";
import { buildAccountantHandoff, buildHandoffCsv } from "@/lib/accounting";

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const table = (title: string, headers: string[], rows: unknown[][]) => `<h2>${escapeHtml(title)}</h2>${rows.length ? `<table><thead><tr>${headers.map(value => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "<p>No records for this section.</p>"}`;

function additionalReportTables(workspace: Workspace, month: string): string {
  const report = buildAccountantHandoff(workspace, month);
  return [
    table("Budget versus actual", ["Category", "Budget", "Actual", "Remaining"], report.budgets.map(row => [row.category, dollars(row.budgetCents), dollars(row.actualCents), dollars(row.remainingCents)])),
    table("Vendor spending", ["Merchant", "Entries", "Total"], report.merchants.map(row => [row.merchant, row.count, dollars(row.totalCents)])),
    table("Possible recurring charges", ["Merchant", "Observed interval", "Occurrences", "Latest", "Change"], report.recurring.map(row => [row.merchant, row.interval, row.occurrences, dollars(row.lastAmountCents), dollars(row.changeCents)])),
    table("Projects and reimbursements", ["Project", "Total costs", "Awaiting reimbursement", "Reimbursed"], report.projects.map(row => [row.project, dollars(row.totalCents), dollars(row.pendingCents), dollars(row.paidCents)])),
    table("Receipt amount differences", ["Expense ID", "Recorded amount", "Receipt amount"], report.receiptCoverage.discrepancies.map(row => [row.expenseId, dollars(row.expectedCents), dollars(row.receiptCents)])),
    table("Receipt date differences", ["Expense ID", "Recorded date", "Receipt date"], report.receiptCoverage.dateDiscrepancies.map(row => [row.expenseId, row.expectedDate, row.receiptDate])),
  ].join("");
}

export function buildPrintableReport(workspace: Workspace, month: string): string {
  const report = buildAccountantHandoff(workspace, month);
  const categoryRows = report.summary.categoryTotals.map(row => `<tr><td>${escapeHtml(row.category)}</td><td>${row.count}</td><td>${dollars(row.totalCents)}</td></tr>`).join("");
  const expenseRows = report.expenses.map(row => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.merchant || row.description)}</td><td>${escapeHtml(row.category)}</td><td>${dollars(Math.round(row.amount * 100))}</td><td>${escapeHtml(row.project || "—")}</td><td>${row.reviewed ? "Reviewed" : "Needs review"}</td></tr>`).join("");
  const findings = report.cleanup.map(row => `<li>${escapeHtml(row.message)} — ${row.expenseIds.map(escapeHtml).join(", ")}</li>`).join("");
  const reconciliation = report.reconciliation.map(row => `<tr><td>${escapeHtml(row.account)}</td><td>${escapeHtml(row.status)}</td><td>${dollars(row.differenceCents)}</td><td>${row.unmatchedLineIds.length + row.invalidLineIds.length}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Expense report ${escapeHtml(month)}</title><style>body{font:14px system-ui,sans-serif;color:#172033;max-width:1000px;margin:40px auto;padding:0 24px;line-height:1.5}h1{font-size:32px;margin-bottom:4px}h2{margin-top:32px}p{color:#526075}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border-bottom:1px solid #dce1e8;padding:10px;text-align:left;overflow-wrap:anywhere}th{background:#f1f4f8}.summary{display:flex;gap:32px;flex-wrap:wrap;background:#eef2ff;padding:20px}.summary strong{display:block;font-size:25px;color:#243a8d}.note{font-size:12px}@media print{body{margin:0;max-width:none}thead{display:table-header-group}tr{break-inside:avoid}.screen{display:none}}</style></head><body><p>EXPENSE TRACKER · V3</p><h1>Monthly expense report</h1><p>${escapeHtml(month)} · ${report.closed ? "Closed period" : "Open period — review outstanding items"}</p><p class="screen">Use your browser’s Print command and select Save as PDF to keep a PDF copy.</p><div class="summary"><div>Recorded spending<strong>${dollars(report.summary.totalCents)}</strong></div><div>Expenses<strong>${report.summary.count}</strong></div><div>Receipt coverage<strong>${report.receiptCoverage.attached}/${report.summary.count}</strong></div><div>Change from ${escapeHtml(report.summary.previousMonth)}<strong>${dollars(report.summary.changeCents)}</strong></div></div><h2>Spending by category</h2><table><thead><tr><th>Category</th><th>Entries</th><th>Total</th></tr></thead><tbody>${categoryRows}</tbody></table><h2>Expense register</h2><table><thead><tr><th>Date</th><th>Merchant / description</th><th>Category</th><th>Amount</th><th>Project</th><th>Review</th></tr></thead><tbody>${expenseRows}</tbody></table>${additionalReportTables(workspace, month)}<h2>Review findings</h2>${findings ? `<ul>${findings}</ul>` : "<p>No cleanup findings.</p>"}<p>Missing receipt attachments: ${report.receiptCoverage.missing}. Receipt amount discrepancies: ${report.receiptCoverage.discrepancies.length}.</p><h2>Reconciliation</h2>${reconciliation ? `<table><thead><tr><th>Account</th><th>Status</th><th>Balance difference</th><th>Unresolved lines</th></tr></thead><tbody>${reconciliation}</tbody></table>` : "<p>No statements imported for this period; account balances have not been reconciled.</p>"}<p class="note">${escapeHtml(report.note)}</p></body></html>`;
}

export function buildAccountantArchive(workspace: Workspace, month: string): Uint8Array {
  const report = buildAccountantHandoff(workspace, month);
  const files: Record<string, Uint8Array> = {
    "expenses.csv": strToU8(buildHandoffCsv(workspace, month)),
    "report.html": strToU8(buildPrintableReport(workspace, month)),
    "report.json": strToU8(JSON.stringify({ ...report, receipts: report.receipts.map(({ dataUrl: _data, ...receipt }) => { void _data; return receipt; }) }, null, 2)),
    "README.txt": strToU8(`Expense Tracker V3 — ${month}\n\nOpen report.html to read or print/save as PDF. expenses.csv contains the expense register. report.json includes report details, unresolved findings, statement matches, category rules, and the full change history. receipts/index.json maps receipt IDs to image files. This is an accountant handoff, not a full workspace backup.\n\n${report.note}\n`),
  };
  const index = report.receipts.map((receipt, position) => {
    const extension = receipt.mimeType === "image/png" ? "png" : receipt.mimeType === "image/webp" ? "webp" : "jpg";
    const file = `receipts/${position + 1}.${extension}`;
    const base64 = receipt.dataUrl.slice(receipt.dataUrl.indexOf(",") + 1);
    const binary = atob(base64);
    files[file] = Uint8Array.from(binary, character => character.charCodeAt(0));
    return { id: receipt.id, filename: receipt.filename, file, expenseIds: [...report.expenses, ...report.supportingExpenses].filter(expense => expense.receiptId === receipt.id).map(expense => expense.id) };
  });
  files["receipts/index.json"] = strToU8(JSON.stringify(index, null, 2));
  return zipSync(files, { level: 6 });
}
