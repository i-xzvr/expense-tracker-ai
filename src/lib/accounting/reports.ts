import type { AccountingExpense, BankStatement, StatementLine, Workspace } from "../../types/accounting";
import { CATEGORIES } from "../../types/expense";
import { normalizeName, toCents, validateMonth } from "./validation";

export interface CleanupFinding { id: string; type: "duplicate" | "category" | "description" | "unreviewed"; message: string; expenseIds: string[] }
export interface ReconciliationReport {
  statementId: string; account: string; startDate: string; endDate: string;
  openingCents: number; closingCents: number; calculatedClosingCents: number; differenceCents: number;
  matchedCount: number; classifiedCount: number; unmatchedLineIds: string[]; unmatchedExpenseIds: string[]; invalidLineIds: string[];
  status: "reconciled" | "needs-review";
  lines: (StatementLine & { candidateExpenseIds: string[] })[];
}
export function reconcileStatement(workspace: Workspace, statement: BankStatement): ReconciliationReport {
  const inAccount = workspace.expenses.filter((e) => normalizeName(e.account ?? "") === normalizeName(statement.account) && e.date >= statement.startDate && e.date <= statement.endDate);
  const candidatesByDateAmount = new Map<string, AccountingExpense[]>();
  for (const expense of inAccount) {
    const key = `${expense.date}:${-toCents(expense.amount)}`;
    const existing = candidatesByDateAmount.get(key);
    if (existing) existing.push(expense); else candidatesByDateAmount.set(key, [expense]);
  }
  const linkCounts = new Map<string, number>();
  for (const s of workspace.statements) for (const l of s.lines) if (l.expenseId) linkCounts.set(l.expenseId, (linkCounts.get(l.expenseId) ?? 0) + 1);
  const used = new Set<string>(); const unmatchedLineIds: string[] = []; const invalidLineIds: string[] = [];
  let matchedCount = 0; let classifiedCount = 0;
  const lines = statement.lines.map((line) => {
    const candidates = candidatesByDateAmount.get(`${line.date}:${line.amountCents}`) ?? [];
    if (line.expenseId) {
      const valid = !line.classification && candidates.some((e) => e.id === line.expenseId) && linkCounts.get(line.expenseId) === 1;
      if (valid) { matchedCount++; used.add(line.expenseId); } else invalidLineIds.push(line.id);
    } else if (line.classification && ["income", "transfer", "other"].includes(line.classification) && !(line.classification === "income" && line.amountCents < 0)) classifiedCount++;
    else unmatchedLineIds.push(line.id);
    return { ...line, candidateExpenseIds: candidates.filter((e) => !linkCounts.has(e.id) || e.id === line.expenseId).map((e) => e.id) };
  });
  const calculatedClosingCents = sumCents([statement.openingCents, ...statement.lines.map((l) => l.amountCents)]);
  const differenceCents = statement.closingCents - calculatedClosingCents;
  const unmatchedExpenseIds = inAccount.filter((e) => !used.has(e.id)).map((e) => e.id);
  return {
    statementId: statement.id, account: statement.account, startDate: statement.startDate, endDate: statement.endDate,
    openingCents: statement.openingCents, closingCents: statement.closingCents, calculatedClosingCents, differenceCents,
    matchedCount, classifiedCount, unmatchedLineIds, unmatchedExpenseIds, invalidLineIds, lines,
    status: differenceCents === 0 && !unmatchedLineIds.length && !unmatchedExpenseIds.length && !invalidLineIds.length ? "reconciled" : "needs-review",
  };
}
function sumCents(values: number[]): number {
  let total = 0;
  for (const value of values) { total += value; if (!Number.isSafeInteger(total)) throw new Error("Report total exceeds the range of exact currency calculations."); }
  return total;
}
function previousMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${String(year - 1).padStart(4, "0")}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}
const merchantName = (expense: AccountingExpense) => expense.merchant?.trim() || "Unspecified merchant";

export function buildAccountingReport(workspace: Workspace, month: string) {
  validateMonth(month);
  const expenses = workspace.expenses.filter((e) => e.date.startsWith(`${month}-`)).map((e) => ({ ...e })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const previous = previousMonth(month);
  const totalCents = sumCents(expenses.map((e) => toCents(e.amount)));
  const previousTotalCents = sumCents(workspace.expenses.filter((e) => e.date.startsWith(`${previous}-`)).map((e) => toCents(e.amount)));
  const categoryTotals = CATEGORIES.map((category) => {
    const selected = expenses.filter((e) => e.category === category);
    return { category, count: selected.length, totalCents: sumCents(selected.map((e) => toCents(e.amount))) };
  });
  const cleanup: CleanupFinding[] = [];
  const duplicates = new Map<string, string[]>();
  for (const e of expenses) {
    const key = `${e.date}|${toCents(e.amount)}|${normalizeName(e.merchant || e.description)}|${normalizeName(e.account ?? "")}`;
    duplicates.set(key, [...(duplicates.get(key) ?? []), e.id]);
    if (e.category === "Other") cleanup.push({ id: `category:${e.id}`, type: "category", message: "Check whether Other is the appropriate category.", expenseIds: [e.id] });
    if (e.description.trim().length < 4) cleanup.push({ id: `description:${e.id}`, type: "description", message: "Add a clearer description for this expense.", expenseIds: [e.id] });
    if (!e.reviewed) cleanup.push({ id: `unreviewed:${e.id}`, type: "unreviewed", message: "Review this expense before closing the month.", expenseIds: [e.id] });
  }
  for (const ids of duplicates.values()) if (ids.length > 1) cleanup.push({ id: `duplicate:${ids.slice().sort().join(":")}`, type: "duplicate", message: "Possible duplicate: same date, amount, merchant/description and account. Confirm before deleting.", expenseIds: ids });
  const missingExpenseIds: string[] = [];
  const discrepancies: { expenseId: string; receiptId: string; expectedCents: number; receiptCents: number }[] = [];
  const dateDiscrepancies: { expenseId: string; receiptId: string; expectedDate: string; receiptDate: string }[] = [];
  let attached = 0;
  const receiptsById = new Map(workspace.receipts.map((r) => [r.id, r]));
  for (const expense of expenses) {
    const receipt = expense.receiptId ? receiptsById.get(expense.receiptId) : undefined;
    if (!receipt) missingExpenseIds.push(expense.id);
    else {
      attached++;
      if (receipt.extracted?.amount !== undefined && toCents(receipt.extracted.amount) !== toCents(expense.amount)) discrepancies.push({ expenseId: expense.id, receiptId: receipt.id, expectedCents: toCents(expense.amount), receiptCents: toCents(receipt.extracted.amount) });
      if (receipt.extracted?.date && receipt.extracted.date !== expense.date) dateDiscrepancies.push({ expenseId: expense.id, receiptId: receipt.id, expectedDate: expense.date, receiptDate: receipt.extracted.date });
    }
  }
  const budgets = workspace.budgets.filter((b) => b.month === month).map((b) => {
    const actualCents = categoryTotals.find((c) => c.category === b.category)!.totalCents;
    return { category: b.category, budgetCents: b.amountCents, actualCents, remainingCents: b.amountCents - actualCents };
  });
  const merchantGroups = new Map<string, AccountingExpense[]>();
  const projectGroups = new Map<string, AccountingExpense[]>();
  const group = (groups: Map<string, AccountingExpense[]>, key: string, expense: AccountingExpense) => {
    const existing = groups.get(key); if (existing) existing.push(expense); else groups.set(key, [expense]);
  };
  for (const e of expenses) {
    group(merchantGroups, normalizeName(merchantName(e)), e);
    group(projectGroups, normalizeName(e.project?.trim() || "Unassigned"), e);
  }
  const merchants = [...merchantGroups.values()].map((rows) => ({ merchant: merchantName(rows[0]), count: rows.length, totalCents: sumCents(rows.map((e) => toCents(e.amount))), expenseIds: rows.map((e) => e.id) })).sort((a, b) => b.totalCents - a.totalCents || a.merchant.localeCompare(b.merchant));
  const projects = [...projectGroups.values()].map((rows) => ({ project: rows[0].project?.trim() || "Unassigned", count: rows.length, totalCents: sumCents(rows.map((e) => toCents(e.amount))), pendingCents: sumCents(rows.filter((e) => e.reimbursement === "pending").map((e) => toCents(e.amount))), paidCents: sumCents(rows.filter((e) => e.reimbursement === "paid").map((e) => toCents(e.amount))), expenseIds: rows.map((e) => e.id) })).sort((a, b) => b.totalCents - a.totalCents || a.project.localeCompare(b.project));
  const history = new Map<string, AccountingExpense[]>();
  for (const e of workspace.expenses) if (e.merchant?.trim() && e.date.slice(0, 7) <= month) {
    group(history, normalizeName(e.merchant), e);
  }
  const recurring: { merchant: string; interval: "monthly" | "weekly"; occurrences: number; lastAmountCents: number; previousAmountCents: number; changeCents: number; expenseIds: string[] }[] = [];
  for (const rows of history.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const recent = rows.slice(-4);
    if (recent.length < 3 || recent[recent.length - 1].date.slice(0, 7) !== month) continue;
    const gaps = recent.slice(1).map((e, i) => (Date.parse(`${e.date}T00:00:00Z`) - Date.parse(`${recent[i].date}T00:00:00Z`)) / 86_400_000);
    const interval = gaps.every((d) => d >= 25 && d <= 35) ? "monthly" : gaps.every((d) => d >= 6 && d <= 8) ? "weekly" : null;
    if (!interval) continue;
    const lastAmountCents = toCents(recent[recent.length - 1].amount); const previousAmountCents = toCents(recent[recent.length - 2].amount);
    recurring.push({ merchant: merchantName(recent[recent.length - 1]), interval, occurrences: recent.length, lastAmountCents, previousAmountCents, changeCents: lastAmountCents - previousAmountCents, expenseIds: recent.map((e) => e.id) });
  }
  recurring.sort((a, b) => a.merchant.localeCompare(b.merchant));
  return {
    month, currency: "USD" as const, expenses,
    summary: { count: expenses.length, totalCents, previousMonth: previous, previousTotalCents, changeCents: totalCents - previousTotalCents, categoryTotals },
    cleanup, receiptCoverage: { attached, missing: missingExpenseIds.length, missingExpenseIds, discrepancies, dateDiscrepancies },
    budgets, merchants, recurring, projects,
    reconciliation: workspace.statements.filter((s) => s.startDate.slice(0, 7) <= month && s.endDate.slice(0, 7) >= month).map((s) => reconcileStatement(workspace, s)),
    closed: workspace.closedMonths.includes(month),
  };
}
export type AccountingReport = ReturnType<typeof buildAccountingReport>;

export function buildAccountantHandoff(workspace: Workspace, month: string) {
  const report = buildAccountingReport(workspace, month);
  const supportIds = new Set([
    ...report.recurring.flatMap(row => row.expenseIds),
    ...report.reconciliation.flatMap(row => [...row.unmatchedExpenseIds, ...row.lines.flatMap(line => line.expenseId ? [line.expenseId] : [])]),
    ...workspace.expenses.filter(row => row.date.startsWith(report.summary.previousMonth + "-")).map(row => row.id),
  ]);
  const currentIds = new Set(report.expenses.map(row => row.id));
  const supportingExpenses = workspace.expenses.filter(row => supportIds.has(row.id) && !currentIds.has(row.id)).map(row => ({ ...row }));
  const ids = new Set([...report.expenses, ...supportingExpenses].map((e) => e.receiptId).filter(Boolean));
  const statementIds = new Set(report.reconciliation.map((s) => s.statementId));
  return {
    schemaVersion: 3 as const, kind: "accountant-handoff" as const,
    note: "Expense bookkeeping report in USD. This is not a complete ledger, profit-and-loss statement, balance sheet, or tax return. Recurring and duplicate flags require human review.",
    ...report, supportingExpenses,
    receipts: workspace.receipts.filter((r) => ids.has(r.id)).map((r) => structuredClone(r)),
    statements: workspace.statements.filter((s) => statementIds.has(s.id)).map((s) => structuredClone(s)),
    rules: structuredClone(workspace.rules), audit: structuredClone(workspace.audit),
  };
}
function csvCell(value: string): string {
  // eslint-disable-next-line no-control-regex
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function buildHandoffCsv(workspace: Workspace, month: string): string {
  const report = buildAccountingReport(workspace, month);
  const rows = [["ID", "Date", "Merchant", "Category", "Amount USD", "Description", "Account", "Project", "Reimbursement", "Reviewed", "Receipt ID"], ...report.expenses.map((e) => [e.id, e.date, e.merchant ?? "", e.category, e.amount.toFixed(2), e.description, e.account ?? "", e.project ?? "", e.reimbursement ?? "none", e.reviewed ? "Yes" : "No", e.receiptId ?? ""])];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
