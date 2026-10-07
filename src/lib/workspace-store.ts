import type { AccountingExpense, BankStatement, Receipt, StatementLine, Workspace } from "../types/accounting";
import type { Category } from "../types/expense";
import { generateId, STORAGE_KEY } from "./storage";
import { buildAccountingReport, emptyWorkspace, normalizeName, parseV2ExpenseReport, parseWorkspaceBackup, validateMonth, validateWorkspace } from "./accounting";

export type WorkspaceInput = Omit<AccountingExpense, "id" | "createdAt">;
export type ReceiptInput = Omit<Receipt, "id" | "createdAt">;
export type StatementInput = Omit<BankStatement, "id" | "lines"> & { lines: Pick<StatementLine, "date" | "description" | "amountCents">[] };
export interface MutationResult { ok: boolean; error?: string; id?: string }
export interface WorkspaceSnapshot { workspace: Workspace; loaded: boolean; error: string | null; canUndo: boolean }
export interface WorkspaceStorePlatform {
  read(): Promise<string | null>;
  /** Must atomically reject if persisted data no longer equals expectedRaw. */
  write(raw: string, expectedRaw: string | null): Promise<void>;
  readLegacy(): string | null;
  subscribeChanges(listener: () => void): () => void;
}
const SERVER_SNAPSHOT: WorkspaceSnapshot = { workspace: emptyWorkspace(), loaded: false, error: null, canUndo: false };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The workspace could not be saved. Your existing data is unchanged.";
function requireOpen(workspace: Workspace, date: string): void {
  if (workspace.closedMonths.includes(date.slice(0, 7))) throw new Error(`Month ${date.slice(0, 7)} is closed. Reopen it before changing its records.`);
}
function requireStatementOpen(workspace: Workspace, statement: BankStatement): void {
  if (workspace.closedMonths.some((month) => statement.startDate.slice(0, 7) <= month && statement.endDate.slice(0, 7) >= month)) throw new Error("This statement covers a closed month. Reopen that month first.");
}
function expenseById(workspace: Workspace, id: string) {
  const expense = workspace.expenses.find((e) => e.id === id);
  if (!expense) throw new Error("This expense no longer exists. Refresh the selection.");
  return expense;
}
function statementById(workspace: Workspace, id: string) {
  const statement = workspace.statements.find((s) => s.id === id);
  if (!statement) throw new Error("This statement no longer exists.");
  return statement;
}
function ensureClosedRecordsPreserved(before: Workspace, after: Workspace): void {
  for (const month of before.closedMonths) {
    if (!after.closedMonths.includes(month)) throw new Error(`Reopen ${month} explicitly before restoring a backup that changes its closed status.`);
    const oldReport = buildAccountingReport(before, month); const newReport = buildAccountingReport(after, month);
    const relevant = (workspace: Workspace, report: ReturnType<typeof buildAccountingReport>) => ({
      expenses: report.expenses, budgets: report.budgets,
      receipts: workspace.receipts.filter((r) => report.expenses.some((e) => e.receiptId === r.id)),
      statements: workspace.statements.filter((s) => s.startDate.slice(0, 7) <= month && s.endDate.slice(0, 7) >= month),
    });
    if (JSON.stringify(relevant(before, oldReport)) !== JSON.stringify(relevant(after, newReport))) throw new Error(`Backup changes closed month ${month}. Reopen the month before restoring it.`);
  }
}
function expenseChangeDetail(before: Workspace, after: Workspace): string {
  const beforeById = new Map(before.expenses.map((e) => [e.id, e])); const afterById = new Map(after.expenses.map((e) => [e.id, e]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes: string[] = [];
  for (const id of ids) {
    const oldExpense = beforeById.get(id); const newExpense = afterById.get(id);
    if (JSON.stringify(oldExpense) === JSON.stringify(newExpense)) continue;
    const fields = (expense: AccountingExpense | undefined) => expense ? { date: expense.date, amount: expense.amount, category: expense.category, account: expense.account, reviewed: expense.reviewed, receiptId: expense.receiptId } : null;
    changes.push(`${id}: ${JSON.stringify(fields(oldExpense))} -> ${JSON.stringify(fields(newExpense))}`);
  }
  return changes.length ? ` Financial records: ${changes.slice(0, 4).join("; ")}${changes.length > 4 ? `; and ${changes.length - 4} more changed records` : ""}` : "";
}

/** Async persistence, cached React snapshots, and atomic durable writes before publishing changes. */
export function createWorkspaceStore(platform?: WorkspaceStorePlatform) {
  let snapshot = SERVER_SNAPSHOT;
  let lastRaw: string | null = null;
  let undoWorkspace: Workspace | null = null;
  let pendingLoad: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const publishError = (error: unknown) => { snapshot = { ...snapshot, loaded: true, error: errorMessage(error) }; notify(); };
  const refresh = async () => {
    if (!platform) return;
    const raw = await platform.read();
    if (raw === null) {
      if (snapshot.loaded && lastRaw !== null) throw new Error("The persisted workspace was removed. Reload before editing to avoid restoring stale data.");
      const legacy = platform.readLegacy();
      let workspace = emptyWorkspace();
      if (legacy) {
        let expenses: unknown;
        try { expenses = JSON.parse(legacy); } catch { throw new Error("Existing V2 expenses are invalid JSON. Export or repair V2 before migration."); }
        workspace = validateWorkspace({ ...workspace, expenses });
        workspace.audit.push({ id: generateId(), at: Date.now(), action: "migration", detail: `Copied ${workspace.expenses.length} V2 expenses. The V2 storage was not changed.` });
      }
      const migrated = JSON.stringify(workspace);
      await platform.write(migrated, null);
      lastRaw = migrated; snapshot = { workspace, loaded: true, error: null, canUndo: false }; notify();
    } else if (!snapshot.loaded || raw !== lastRaw) {
      const workspace = parseWorkspaceBackup(raw);
      lastRaw = raw; undoWorkspace = null; snapshot = { workspace, loaded: true, error: null, canUndo: false }; notify();
    }
  };
  const initialize = () => {
    if (!platform || snapshot.loaded || pendingLoad) return pendingLoad ?? Promise.resolve();
    pendingLoad = refresh().catch(publishError).finally(() => { pendingLoad = undefined; });
    return pendingLoad;
  };
  const change = (action: string, detail: string | (() => string), apply: (workspace: Workspace) => string | void, options: { undo?: boolean } = {}): Promise<MutationResult> => {
    const operation = queue.then(async (): Promise<MutationResult> => {
      if (!platform) return { ok: false, error: "Workspace storage is only available in the browser." };
      try {
        await initialize();
        await refresh();
        const before = snapshot.workspace;
        const updated = structuredClone(before);
        const id = apply(updated);
        updated.audit.push({ id: generateId(), at: Date.now(), action, detail: `${typeof detail === "function" ? detail() : detail}${expenseChangeDetail(before, updated)}`.slice(0, 2_500) });
        const validated = validateWorkspace(updated);
        const raw = JSON.stringify(validated);
        await platform.write(raw, lastRaw);
        undoWorkspace = options.undo ? null : structuredClone(before);
        lastRaw = raw;
        snapshot = { workspace: validated, loaded: true, error: null, canUndo: undoWorkspace !== null };
        notify();
        return { ok: true, ...(id ? { id } : {}) };
      } catch (error) { publishError(error); return { ok: false, error: errorMessage(error) }; }
    });
    queue = operation;
    return operation;
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (platform && listeners.size === 1) {
        unsubscribe = platform.subscribeChanges(() => { queue = queue.then(refresh).catch(publishError); });
        queue = queue.then(async () => { await initialize(); if (snapshot.loaded) await refresh(); }).catch(publishError);
      }
      return () => { listeners.delete(listener); if (!listeners.size) { unsubscribe?.(); unsubscribe = undefined; } };
    },
    ready: initialize,
    clearError() { if (snapshot.error) { snapshot = { ...snapshot, error: null }; notify(); } },
    addExpense(input: WorkspaceInput) {
      return change("expense.add", `Added expense: ${input.description}`, (w) => {
        requireOpen(w, input.date);
        const id = generateId();
        w.expenses.unshift({ ...input, id, createdAt: Date.now() });
        return id;
      });
    },
    updateExpense(id: string, input: Partial<WorkspaceInput>) {
      return change("expense.update", `Updated expense ${id}`, (w) => {
        const expense = expenseById(w, id); requireOpen(w, expense.date); requireOpen(w, input.date ?? expense.date);
        for (const statement of w.statements) if (statement.lines.some((l) => l.expenseId === id)) requireStatementOpen(w, statement);
        Object.assign(expense, input);
      });
    },
    deleteExpense(id: string) {
      return change("expense.delete", `Deleted expense ${id}`, (w) => {
        const expense = expenseById(w, id); requireOpen(w, expense.date);
        if (w.statements.some((s) => s.lines.some((l) => l.expenseId === id))) throw new Error("Unmatch this expense from its statement before deleting it.");
        w.expenses = w.expenses.filter((e) => e.id !== id);
      });
    },
    addReceipt(input: ReceiptInput) {
      return change("receipt.add", `Stored receipt: ${input.filename}`, (w) => { const id = generateId(); w.receipts.push({ ...input, id, createdAt: Date.now() }); return id; });
    },
    updateReceipt(receiptId: string, input: Partial<ReceiptInput>) {
      return change("receipt.update", `Updated receipt evidence ${receiptId}`, (w) => {
        const receipt = w.receipts.find((r) => r.id === receiptId);
        if (!receipt) throw new Error("Receipt no longer exists.");
        for (const expense of w.expenses.filter((e) => e.receiptId === receiptId)) {
          requireOpen(w, expense.date);
          for (const statement of w.statements) if (statement.lines.some((l) => l.expenseId === expense.id)) requireStatementOpen(w, statement);
        }
        Object.assign(receipt, input);
      });
    },
    attachReceipt(expenseId: string, receiptId: string | null) {
      return change("receipt.attach", `Changed receipt attachment for expense ${expenseId}`, (w) => {
        const expense = expenseById(w, expenseId); requireOpen(w, expense.date);
        for (const s of w.statements) if (s.lines.some((l) => l.expenseId === expenseId)) requireStatementOpen(w, s);
        if (receiptId === null) delete expense.receiptId; else expense.receiptId = receiptId;
      });
    },
    removeReceipt(receiptId: string) {
      return change("receipt.delete", `Removed unattached receipt ${receiptId}`, (w) => {
        if (w.expenses.some((e) => e.receiptId === receiptId)) throw new Error("Detach this receipt from its expense before removing it.");
        if (!w.receipts.some((r) => r.id === receiptId)) throw new Error("Receipt no longer exists.");
        w.receipts = w.receipts.filter((r) => r.id !== receiptId);
      });
    },
    setBudget(month: string, category: Category, amountCents: number) {
      return change("budget.set", `Set ${category} budget for ${month}`, (w) => {
        validateMonth(month); requireOpen(w, `${month}-01`);
        w.budgets = [...w.budgets.filter((b) => b.month !== month || b.category !== category), { month, category, amountCents }];
      });
    },
    addRule(merchant: string, category: Category) {
      return change("rule.set", `Set suggested category for merchant ${merchant}`, (w) => {
        const existing = w.rules.find((r) => normalizeName(r.merchant) === normalizeName(merchant));
        if (existing) { existing.category = category; return existing.id; }
        const id = generateId(); w.rules.push({ id, merchant: merchant.trim(), category }); return id;
      });
    },
    addStatement(input: StatementInput) {
      return change("statement.import", `Imported statement for ${input.account}, ${input.startDate} to ${input.endDate}`, (w) => {
        const id = generateId();
        const statement: BankStatement = { ...input, id, lines: input.lines.map((l) => ({ ...l, id: generateId() })) };
        requireStatementOpen(w, statement); w.statements.push(statement); return id;
      });
    },
    removeStatement(statementId: string) {
      return change("statement.delete", `Removed statement ${statementId}; its expenses were retained.`, (w) => {
        const statement = statementById(w, statementId); requireStatementOpen(w, statement);
        w.statements = w.statements.filter((s) => s.id !== statementId);
      });
    },
    matchStatementLine(statementId: string, lineId: string, expenseId: string | null) {
      return change("statement.match", `Changed match for statement transaction ${lineId}`, (w) => {
        const statement = statementById(w, statementId); requireStatementOpen(w, statement);
        const line = statement.lines.find((l) => l.id === lineId); if (!line) throw new Error("Statement transaction no longer exists.");
        delete line.classification;
        if (expenseId === null) delete line.expenseId;
        else { const expense = expenseById(w, expenseId); requireOpen(w, expense.date); line.expenseId = expenseId; }
      });
    },
    classifyStatementLine(statementId: string, lineId: string, classification: StatementLine["classification"] | null) {
      return change("statement.classify", `Classified statement transaction ${lineId}`, (w) => {
        const statement = statementById(w, statementId); requireStatementOpen(w, statement);
        const line = statement.lines.find((l) => l.id === lineId); if (!line) throw new Error("Statement transaction no longer exists.");
        delete line.expenseId;
        if (classification === null) delete line.classification; else line.classification = classification;
      });
    },
    closeMonth(month: string) {
      return change("month.close", `Closed month ${month}`, (w) => {
        validateMonth(month); if (w.closedMonths.includes(month)) throw new Error("This month is already closed.");
        const report = buildAccountingReport(w, month);
        if (report.expenses.some((e) => !e.reviewed)) throw new Error("Review every expense in this month before closing it.");
        if (report.receiptCoverage.discrepancies.length || report.receiptCoverage.dateDiscrepancies.length) throw new Error("Resolve receipt amount and date differences before closing this month.");
        if (report.reconciliation.some((s) => s.status !== "reconciled")) throw new Error("Resolve unmatched records and statement balance differences before closing this month.");
        w.closedMonths.push(month); w.closedMonths.sort();
      });
    },
    reopenMonth(month: string) {
      return change("month.reopen", `Reopened month ${month}`, (w) => { validateMonth(month); if (!w.closedMonths.includes(month)) throw new Error("This month is already open."); w.closedMonths = w.closedMonths.filter((m) => m !== month); });
    },
    undo() {
      return change("workspace.undo", "Undid the last local change; retained the full audit history.", (w) => {
        if (!undoWorkspace) throw new Error("There is no local change to undo. Changes from another tab clear undo history.");
        const previous = structuredClone(undoWorkspace);
        // Undo is explicit and can undo closing a month; other protected changes still require reopening.
        const audit = w.audit; Object.assign(w, previous, { audit });
      }, { undo: true });
    },
    importBackup(raw: string) {
      return change("workspace.restore", "Restored a validated V3 workspace backup; retained existing audit history.", (w) => {
        const imported = parseWorkspaceBackup(raw); ensureClosedRecordsPreserved(w, imported);
        const auditIds = new Set(w.audit.map((a) => a.id));
        const audit = [...w.audit, ...imported.audit.filter((a) => !auditIds.has(a.id))].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
        Object.assign(w, imported, { audit });
      });
    },
    importV2Report(raw: string) {
      let added = 0; let skipped = 0;
      return change("workspace.import-v2", () => `Imported V2 expense export: added ${added}, skipped ${skipped} existing identical records; existing V3 details retained.`, (w) => {
        const expenses = parseV2ExpenseReport(raw);
        const base = (expense: AccountingExpense) => JSON.stringify({ id: expense.id, date: expense.date, amount: expense.amount, category: expense.category, description: expense.description, createdAt: expense.createdAt });
        for (const expense of expenses) {
          const existing = w.expenses.find((e) => e.id === expense.id);
          if (existing) {
            if (base(existing) !== base(expense)) throw new Error(`Expense ${expense.id} has conflicting V2 and V3 values. No expenses were imported.`);
            skipped++; continue;
          }
          requireOpen(w, expense.date); w.expenses.push(expense); added++;
        }
      });
    },
    suggestedCategory(merchant: string): Category | undefined { return snapshot.workspace.rules.find((r) => normalizeName(r.merchant) === normalizeName(merchant))?.category; },
  };
}

const DATABASE_NAME = "expense-tracker-v3";
const STORE_NAME = "workspace";
const RECORD_KEY = "active";
function browserPlatform(): WorkspaceStorePlatform {
  let database: Promise<IDBDatabase> | undefined;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("expense-tracker-v3-changes") : null;
  const connect = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
    request.onerror = () => { database = undefined; reject(new Error("IndexedDB is unavailable. Enable browser storage to use the local workspace.")); };
    request.onblocked = () => { database = undefined; reject(new Error("Close other expense-tracker tabs and retry opening the workspace.")); };
  });
  return {
    async read() {
      const db = await connect();
      return new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly"); const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => reject(new Error("The local workspace could not be read."));
      });
    },
    async write(raw, expectedRaw) {
      const db = await connect();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite"); const store = transaction.objectStore(STORE_NAME); const request = store.get(RECORD_KEY);
        let conflict = false;
        request.onsuccess = () => {
          const current = typeof request.result === "string" ? request.result : null;
          if (current !== expectedRaw) { conflict = true; transaction.abort(); return; }
          store.put(raw, RECORD_KEY);
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(new Error(conflict ? "Another tab changed this workspace. Review the refreshed records and retry your change." : "Could not save the workspace. Browser storage may be full or unavailable; existing data is unchanged."));
        transaction.onerror = () => { /* onabort reports the final transaction outcome. */ };
      });
      channel?.postMessage("changed");
    },
    readLegacy: () => window.localStorage.getItem(STORAGE_KEY),
    subscribeChanges(listener) {
      const visibility = () => { if (document.visibilityState === "visible") listener(); };
      channel?.addEventListener("message", listener);
      window.addEventListener("focus", listener); document.addEventListener("visibilitychange", visibility);
      return () => { channel?.removeEventListener("message", listener); window.removeEventListener("focus", listener); document.removeEventListener("visibilitychange", visibility); };
    },
  };
}
export const workspaceStore = createWorkspaceStore(typeof window === "undefined" ? undefined : browserPlatform());
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
