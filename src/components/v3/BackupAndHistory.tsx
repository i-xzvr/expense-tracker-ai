"use client";

import { useState } from "react";
import { exportWorkspaceBackup, parseV2ExpenseReport, parseWorkspaceBackup } from "@/lib/accounting";
import type { Workspace } from "@/types/accounting";
import type { WorkspaceController } from "./types";
import { Cell, DataTable, Empty, money, Notice, Panel, saveFile, useFeedback } from "./shared";

export default function BackupAndHistory({ controller }: { controller: WorkspaceController }) {
  const [pending, setPending] = useState<{ raw: string; parsed: Workspace; name: string } | null>(null);
  const [pendingV2, setPendingV2] = useState<{ raw: string; expenses: ReturnType<typeof parseV2ExpenseReport>; name: string } | null>(null);
  const [importingV2, setImportingV2] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const { feedback, setFeedback, result } = useFeedback();
  const existingIds = new Set(controller.workspace.expenses.map(expense => expense.id));
  const v2ExistingCount = pendingV2?.expenses.filter(expense => existingIds.has(expense.id)).length ?? 0;
  return <div className="space-y-6"><Panel title="Financial workspace portability" description="The app and AI setup are separate from your financial data. A financial backup carries your expenses, receipts, budgets, rules, statements, and change history."><ol className="list-inside list-decimal space-y-2 text-sm text-slate-600"><li>Use the V4 combined backup above to include chats, or download a financial-only backup below.</li><li>Copy the V4 source package to the other Windows computer and run Setup-V4.cmd.</li><li>Run Start-V4.cmd, open this Backup page, and restore the workspace file.</li></ol><div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary" onClick={() => { try { saveFile(`expense-tracker-v3-backup-${new Date().toISOString().slice(0, 10)}.json`, exportWorkspaceBackup(controller.workspace)); setFeedback({ message: "Financial-only backup download started; chats are excluded. Keep it somewhere safe; it contains your receipt images and financial records." }); } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : "Backup failed." }); } }}>Download financial-only backup</button><button className="btn-secondary" disabled={!controller.canUndo || importingV2} onClick={async () => result(await controller.undo(), "Last change undone. The reversal is recorded in history.")}>Undo last change</button></div><p className="mt-3 text-xs text-slate-500">Data belongs to this browser profile and site address. Clearing site data removes it. Backups contain sensitive information and are not encrypted.</p></Panel>
    {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
    <Panel title="Bring your V2 expenses into V3" description="In V2, export all expenses as JSON. Select that file here to preview and merge the expense records into your V3 workspace.">
      <p className="mb-4 text-sm text-slate-600">Automatic migration copies V2 data only when V3 creates its first workspace in the same browser profile and at the exact same site address, including the port. If V2 and V3 run on different ports or computers, use this import. Later V2 changes never sync automatically.</p>
      <label className="label" htmlFor="v2-expense-file">V2 JSON expense export</label>
      <input id="v2-expense-file" className="input" type="file" accept=".json,application/json" disabled={importingV2} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        setPendingV2(null);
        try {
          if (file.size > 10_000_000) throw new Error("Choose a V2 export smaller than 10 MB.");
          const raw = await file.text(); const expenses = parseV2ExpenseReport(raw);
          setPendingV2({ raw, expenses, name: file.name }); setFeedback(null);
        } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : "Invalid V2 expense export." }); }
      }} />
      {pendingV2 && <div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold">{pendingV2.name}</p>
        <p className="text-sm">{pendingV2.expenses.length} validated expenses · {pendingV2.expenses.length - v2ExistingCount} new IDs · {v2ExistingCount} IDs already in V3</p>
        <p className="text-xs text-slate-600">Existing identical expenses are skipped and keep their V3 receipts and accounting details. Conflicting values, invalid records, or new entries in closed months cancel the entire import. Exported summary totals are ignored and recalculated from the expense records.</p>
        {pendingV2.expenses.length > 0 ? <DataTable label="V2 expense import preview" headers={["Date", "Description", "Category", "Amount"]}>
          {pendingV2.expenses.slice(0, 5).map(expense => <tr key={expense.id}><Cell>{expense.date}</Cell><Cell>{expense.description}</Cell><Cell>{expense.category}</Cell><Cell>{money(Math.round(expense.amount * 100))}</Cell></tr>)}
        </DataTable> : <Empty>This export has no expenses to import.</Empty>}
        {pendingV2.expenses.length > 5 && <p className="text-xs text-slate-500">Showing the first 5 expenses. All {pendingV2.expenses.length} records will be checked before saving.</p>}
        <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={importingV2 || pendingV2.expenses.length === 0} onClick={async () => {
          setImportingV2(true);
          try { if (result(await controller.importV2Report(pendingV2.raw), "V2 expenses imported. Existing identical records and their V3 details were retained; the result is recorded in history.")) setPendingV2(null); }
          finally { setImportingV2(false); }
        }}>{importingV2 ? "Importing expenses…" : "Import these V2 expenses"}</button><button className="btn-secondary" disabled={importingV2} onClick={() => setPendingV2(null)}>Cancel import</button></div>
      </div>}
    </Panel>
    <Panel title="Restore a full backup" description="Validate and preview a V3 backup before replacing the current workspace. Accountant report packages cannot be restored as backups."><label className="label" htmlFor="backup-file">V3 workspace JSON</label><input id="backup-file" className="input" type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setPending(null); setConfirmRestore(false); try { if (file.size > 110_000_000) throw new Error("The backup exceeds the supported size."); const raw = await file.text(); const parsed = parseWorkspaceBackup(raw); setPending({ raw, parsed, name: file.name }); setFeedback(null); } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : "Invalid backup." }); } }} />{pending && <div className="mt-5 space-y-4 rounded-xl bg-amber-50 p-4"><p className="text-sm font-semibold">{pending.name}</p><p className="text-sm">{pending.parsed.expenses.length} expenses · {pending.parsed.receipts.length} receipts · {pending.parsed.statements.length} statements · {pending.parsed.budgets.length} budgets</p><label className="flex items-start gap-2 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={confirmRestore} onChange={e => setConfirmRestore(e.target.checked)} /> Replace my current workspace with this backup. I have exported any current records I need to keep.</label><div className="flex gap-3"><button className="btn-primary" disabled={!confirmRestore} onClick={async () => { if (result(await controller.importBackup(pending.raw), "Workspace restored, including receipt evidence.")) { setPending(null); setConfirmRestore(false); } }}>Restore this backup</button><button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button></div></div>}</Panel>
    <Panel title="Saved category rules" description="Rules suggest a category when you enter the same merchant. They never silently recategorize existing records.">{controller.workspace.rules.length ? <DataTable label="Merchant category rules" headers={["Merchant", "Suggested category"]}>{controller.workspace.rules.map(rule => <tr key={rule.id}><Cell>{rule.merchant}</Cell><Cell>{rule.category}</Cell></tr>)}</DataTable> : <Empty>No saved rules. Use “Remember this merchant’s category” in the expense form.</Empty>}</Panel>
    <Panel title="Change history" description="Local records of changes and reversals. This history supports review; a browser backup is not a tamper-proof audit system.">{controller.workspace.audit.length ? <DataTable label="Workspace change history" headers={["When", "Action", "Detail"]}>{controller.workspace.audit.slice(-100).reverse().map(entry => <tr key={entry.id}><Cell>{new Date(entry.at).toLocaleString()}</Cell><Cell>{entry.action}</Cell><Cell>{entry.detail}</Cell></tr>)}</DataTable> : <Empty>No recorded changes yet.</Empty>}<p className="mt-3 text-xs text-slate-500">Showing the most recent 100 events. Full history is included in your backup.</p></Panel>
  </div>;
}
