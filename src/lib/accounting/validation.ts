import { parseISODate } from "../format";
import { isCategory } from "../../types/expense";
import type { Workspace } from "../../types/accounting";

export const MAX_BACKUP_CHARS = 100_000_000;
export const MAX_RECEIPT_CHARS = 10_000_000;
const MAX_ITEMS = 10_000;
export function emptyWorkspace(): Workspace {
  return { schemaVersion: 3, expenses: [], receipts: [], budgets: [], rules: [], statements: [], audit: [], closedMonths: [] };
}
function fail(message: string): never { throw new Error(message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function allowedKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} contains an unsupported field: ${key}.`);
}
function text(value: unknown, label: string, max = 500, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > max) fail(`${label} is missing or too long.`);
}
function integer(value: unknown, label: string, min = -1_000_000_000_000, max = 1_000_000_000_000): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be a valid integer within the supported range.`);
}
function date(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !parseISODate(value)) fail(`${label} must be a real YYYY-MM-DD date.`);
}
export function validateMonth(value: string): void {
  if (!/^\d{4}-\d{2}$/.test(value) || !parseISODate(`${value}-01`)) fail("Choose a valid YYYY-MM month.");
}
export function toCents(value: number): number {
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(cents) || cents / 100 !== value || cents > 1_000_000_000_000) fail("Expense amounts must be positive, with at most two decimal places.");
  return cents;
}
function array(value: unknown, label: string, max = MAX_ITEMS): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be a list of at most ${max} entries.`);
  return value;
}
function uniqueId(entry: Record<string, unknown>, ids: Set<string>, label: string): void {
  text(entry.id, `${label} ID`, 100);
  if (ids.has(entry.id)) fail(`${label} IDs must be unique.`);
  ids.add(entry.id);
}
function optionalText(value: unknown, label: string, max = 200): void {
  if (value !== undefined) text(value, label, max, true);
}
export function normalizeName(value: string): string { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }

/** Validate the entire backup before anything reaches browser storage. Never partially import. */
export function validateWorkspace(input: unknown): Workspace {
  const w = record(input, "Workspace");
  allowedKeys(w, ["schemaVersion", "expenses", "receipts", "budgets", "rules", "statements", "audit", "closedMonths"], "Workspace");
  if (w.schemaVersion !== 3) fail("This backup must use workspace schema version 3.");
  if (JSON.stringify(input).length > MAX_BACKUP_CHARS) fail("Workspace exceeds the 100 MB backup limit. Reduce receipt sizes.");
  const receiptIds = new Set<string>();
  let receiptSize = 0;
  for (const value of array(w.receipts, "Receipts", 2_000)) {
    const r = record(value, "Receipt"); uniqueId(r, receiptIds, "Receipt");
    allowedKeys(r, ["id", "filename", "mimeType", "dataUrl", "createdAt", "extracted"], "Receipt");
    text(r.filename, "Receipt filename", 255);
    if (!["image/jpeg", "image/png", "image/webp"].includes(String(r.mimeType))) fail("Receipts must be JPEG, PNG, or WebP images.");
    text(r.dataUrl, "Receipt image", MAX_RECEIPT_CHARS);
    const prefix = `data:${r.mimeType};base64,`;
    const payload = r.dataUrl.slice(prefix.length);
    if (!r.dataUrl.startsWith(prefix) || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 !== 0) fail("Receipt data must be a valid base64 image matching its type.");
    receiptSize += r.dataUrl.length;
    integer(r.createdAt, "Receipt creation time", 0, Number.MAX_SAFE_INTEGER);
    if (r.extracted !== undefined) {
      const e = record(r.extracted, "Extracted receipt fields");
      allowedKeys(e, ["date", "amount", "merchant", "description", "category"], "Extracted receipt fields");
      if (e.date !== undefined) date(e.date, "Receipt date");
      if (e.amount !== undefined) toCents(e.amount as number);
      optionalText(e.merchant, "Receipt merchant"); optionalText(e.description, "Receipt description", 2_000);
      if (e.category !== undefined && !isCategory(e.category)) fail("Receipt category is invalid.");
    }
  }
  if (receiptSize > 90_000_000) fail("Receipt images exceed the 90 MB workspace limit. Use smaller images.");
  const expenseIds = new Set<string>();
  const attachedReceipts = new Set<string>();
  let expenseTotal = 0;
  for (const value of array(w.expenses, "Expenses")) {
    const e = record(value, "Expense"); uniqueId(e, expenseIds, "Expense");
    allowedKeys(e, ["id", "date", "amount", "category", "description", "createdAt", "merchant", "project", "account", "reimbursement", "reviewed", "receiptId"], "Expense");
    date(e.date, "Expense date"); toCents(e.amount as number);
    expenseTotal += toCents(e.amount as number);
    if (!Number.isSafeInteger(expenseTotal)) fail("Expense totals exceed the range of exact currency calculations.");
    if (!isCategory(e.category)) fail("Expense category is invalid.");
    text(e.description, "Expense description", 2_000, true); integer(e.createdAt, "Expense creation time", 0, Number.MAX_SAFE_INTEGER);
    for (const key of ["merchant", "project", "account"]) optionalText(e[key], key);
    if (e.reimbursement !== undefined && !["none", "pending", "paid"].includes(String(e.reimbursement))) fail("Expense reimbursement status is invalid.");
    if (e.reviewed !== undefined && typeof e.reviewed !== "boolean") fail("Expense review status must be true or false.");
    if (e.receiptId !== undefined) {
      text(e.receiptId, "Receipt reference", 100);
      if (!receiptIds.has(e.receiptId)) fail("An expense references a missing receipt.");
      if (attachedReceipts.has(e.receiptId)) fail("A receipt can be attached to only one expense.");
      attachedReceipts.add(e.receiptId);
    }
  }
  const budgetKeys = new Set<string>();
  for (const value of array(w.budgets, "Budgets")) {
    const b = record(value, "Budget"); text(b.month, "Budget month", 7); validateMonth(b.month);
    allowedKeys(b, ["month", "category", "amountCents"], "Budget");
    if (!isCategory(b.category)) fail("Budget category is invalid.");
    integer(b.amountCents, "Budget amount", 0);
    const key = `${b.month}:${b.category}`; if (budgetKeys.has(key)) fail("A month/category budget is duplicated."); budgetKeys.add(key);
  }
  const ruleIds = new Set<string>(); const merchants = new Set<string>();
  for (const value of array(w.rules, "Rules", 2_000)) {
    const r = record(value, "Rule"); uniqueId(r, ruleIds, "Rule"); text(r.merchant, "Rule merchant", 200);
    allowedKeys(r, ["id", "merchant", "category"], "Rule");
    if (!isCategory(r.category)) fail("Rule category is invalid.");
    const key = normalizeName(r.merchant); if (merchants.has(key)) fail("A merchant rule is duplicated."); merchants.add(key);
  }
  const statementIds = new Set<string>(); const lineIds = new Set<string>(); const linkedExpenses = new Set<string>(); const fingerprints = new Set<string>();
  const expensesById = new Map((w.expenses as Workspace["expenses"]).map((e) => [e.id, e]));
  let lineCount = 0;
  for (const value of array(w.statements, "Statements", 2_000)) {
    const s = record(value, "Statement"); uniqueId(s, statementIds, "Statement"); text(s.account, "Statement account", 200);
    allowedKeys(s, ["id", "account", "startDate", "endDate", "openingCents", "closingCents", "lines"], "Statement");
    date(s.startDate, "Statement start"); date(s.endDate, "Statement end");
    if (s.startDate > s.endDate) fail("Statement start must be before its end.");
    integer(s.openingCents, "Statement opening balance"); integer(s.closingCents, "Statement closing balance");
    const lines = array(s.lines, "Statement lines"); lineCount += lines.length;
    let statementBalance = s.openingCents;
    for (const value of lines) {
      const l = record(value, "Statement line"); uniqueId(l, lineIds, "Statement line"); date(l.date, "Statement line date");
      allowedKeys(l, ["id", "date", "description", "amountCents", "expenseId", "classification"], "Statement line");
      if (l.date < s.startDate || l.date > s.endDate) fail("Statement transactions must fall inside the statement dates.");
      text(l.description, "Statement description", 2_000); integer(l.amountCents, "Statement amount");
      statementBalance += l.amountCents;
      if (!Number.isSafeInteger(statementBalance)) fail("Statement balance exceeds the range of exact currency calculations.");
      if (l.amountCents === 0) fail("Statement transactions cannot be zero.");
      if (l.classification !== undefined && !["income", "transfer", "other"].includes(String(l.classification))) fail("Statement classification is invalid.");
      if (l.classification === "income" && l.amountCents < 0) fail("An outgoing transaction cannot be classified as income.");
      if (l.expenseId !== undefined) {
        text(l.expenseId, "Statement expense reference", 100);
        if (!expenseIds.has(l.expenseId)) fail("A statement references a missing expense.");
        if (linkedExpenses.has(l.expenseId)) fail("An expense cannot match more than one statement transaction.");
        if (l.classification !== undefined) fail("A statement transaction cannot be both matched and classified.");
        linkedExpenses.add(l.expenseId);
        const expense = expensesById.get(l.expenseId)!;
        if (l.amountCents !== -toCents(expense.amount) || l.date !== expense.date || normalizeName(String(s.account)) !== normalizeName(expense.account ?? "")) fail("Matched transaction date, amount, and account must exactly match the expense.");
      }
    }
    const fingerprint = statementFingerprint(s as unknown as Workspace["statements"][number]);
    if (fingerprints.has(fingerprint)) fail("This statement has already been imported."); fingerprints.add(fingerprint);
  }
  if (lineCount > MAX_ITEMS) fail("The workspace supports at most 10,000 statement transactions.");
  const auditIds = new Set<string>();
  for (const value of array(w.audit, "Audit history", 50_000)) {
    const a = record(value, "Audit entry"); uniqueId(a, auditIds, "Audit entry"); integer(a.at, "Audit time", 0, Number.MAX_SAFE_INTEGER); text(a.action, "Audit action", 100); text(a.detail, "Audit detail", 2_500);
    allowedKeys(a, ["id", "at", "action", "detail"], "Audit entry");
  }
  const closed = new Set<string>();
  for (const m of array(w.closedMonths, "Closed months", 1_200)) {
    text(m, "Closed month", 7); validateMonth(m); if (closed.has(m)) fail("A closed month is duplicated."); closed.add(m);
  }
  return structuredClone(input) as Workspace;
}

export function statementFingerprint(statement: Pick<Workspace["statements"][number], "account" | "startDate" | "endDate" | "openingCents" | "closingCents" | "lines">): string {
  return JSON.stringify([normalizeName(statement.account), statement.startDate, statement.endDate, statement.openingCents, statement.closingCents, statement.lines.map((l) => [l.date, normalizeName(l.description), l.amountCents]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

export function parseWorkspaceBackup(raw: string): Workspace {
  if (raw.length > MAX_BACKUP_CHARS) fail("Backup exceeds the 100 MB limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail("Backup is not valid JSON."); }
  return validateWorkspace(parsed);
}
export function exportWorkspaceBackup(workspace: Workspace): string {
  const validated = validateWorkspace(workspace);
  const readable = `${JSON.stringify(validated, null, 2)}\n`;
  return readable.length <= MAX_BACKUP_CHARS ? readable : JSON.stringify(validated);
}
