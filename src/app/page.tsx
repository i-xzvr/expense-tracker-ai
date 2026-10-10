"use client";

import { useCallback, useMemo, useState } from "react";
import { EMPTY_FILTERS, type ExpenseFilters, type ExpenseInput } from "@/types/expense";
import type { AccountingExpense } from "@/types/accounting";
import { useWorkspace } from "@/hooks/useWorkspace";
import { filterExpenses, sortByDateDesc } from "@/lib/expenses";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import SummaryCards from "@/components/SummaryCards";
import SpendingCharts from "@/components/SpendingCharts";
import ExpenseFiltersBar from "@/components/ExpenseFilters";
import ExpenseList from "@/components/ExpenseList";
import ExpenseForm from "@/components/ExpenseForm";
import Modal from "@/components/Modal";
import ExportDialog from "@/components/ExportDialog";
import Reports from "@/components/v3/Reports";
import ReceiptInbox from "@/components/v3/ReceiptInbox";
import Reconcile from "@/components/v3/Reconcile";
import ChatAssistant from "@/components/v3/ChatAssistant";
import BackupAndHistory from "@/components/v3/BackupAndHistory";
import PortableBackup from "@/components/v4/PortableBackup";
import Integrations from "@/components/v4/Integrations";
import AgentJobs from "@/components/v4/AgentJobs";
import MonthlyInsights from "@/components/v4/MonthlyInsights";
import { Notice, useFeedback } from "@/components/v3/shared";

const tabs = ["Overview", "Insights", "Reports", "Receipts", "Reconcile", "Local AI", "Backup", "Tools", "Integrations", "Coding agent"] as const;
type Tab = (typeof tabs)[number];
type FormState = { mode: "add"; defaults?: Partial<AccountingExpense> } | { mode: "edit"; expense: AccountingExpense } | null;

export default function HomePage() {
  const controller = useWorkspace();
  const { workspace, loaded } = controller;
  const { expenses } = workspace;
  const [tab, setTab] = useState<Tab>("Overview");
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [filters, setFilters] = useState<ExpenseFilters>(EMPTY_FILTERS);
  const [form, setForm] = useState<FormState>(null);
  const [pendingDelete, setPendingDelete] = useState<AccountingExpense | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { feedback, setFeedback, result } = useFeedback();
  const filtered = useMemo(() => sortByDateDesc(filterExpenses(expenses, filters)), [expenses, filters]);
  const total = filtered.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const closeForm = useCallback(() => setForm(null), []);
  const closeDelete = useCallback(() => setPendingDelete(null), []);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const edit = (expense: AccountingExpense) => { setFeedback(null); setForm({ mode: "edit", expense }); };
  const create = (defaults?: Partial<AccountingExpense>) => { setFeedback(null); setForm({ mode: "add", defaults }); };

  async function handleSubmit(data: ExpenseInput & Partial<AccountingExpense>) {
    if (saving) return;
    setSaving(true);
    try {
      const outcome = form?.mode === "edit"
        ? await controller.updateExpense(form.expense.id, data)
        : await controller.addExpense({ ...data, ...(form?.mode === "add" && form.defaults?.receiptId ? { receiptId: form.defaults.receiptId } : {}) });
      if (result(outcome, "Expense saved on this device.")) setForm(null);
    } finally { setSaving(false); }
  }

  return <div className="min-h-screen">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3"><div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">E</div><div><h1 className="text-lg font-semibold leading-tight">Expense Tracker <span className="ml-1 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">V4</span></h1><p className="mt-1 text-xs text-slate-500">Your records, clear reports, local intelligence.</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={!loaded} aria-haspopup="dialog" onClick={() => setChatOpen(true)}>AI chat</button><button type="button" className="btn-secondary" disabled={!loaded} aria-haspopup="dialog" onClick={() => setExportOpen(true)}>Export Data</button><button type="button" className="btn-primary" disabled={!loaded} onClick={() => create()}>Add expense</button></div>
      </div>
      <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 sm:px-6">{tabs.map(item => <button key={item} onClick={() => { setTab(item); setFeedback(null); }} aria-current={tab === item ? "page" : undefined} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === item ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{item}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {!loaded ? <p className="py-24 text-center text-sm text-slate-500">Loading your workspace…</p> : <>
        {controller.error && <div><Notice error>{controller.error}</Notice><button onClick={controller.clearError} className="mt-2 text-sm text-slate-500 underline">Dismiss message</button></div>}
        {feedback && !form && <Notice error={feedback.error}>{feedback.message}</Notice>}
        {(["Reports", "Reconcile", "Local AI"] as Tab[]).includes(tab) && <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your workspace</p><h2 className="mt-1 text-2xl font-semibold">{tab === "Local AI" ? "Ask your local assistant" : tab === "Reconcile" ? "Reconcile your accounts" : "Reports and month-end review"}</h2></div><label className="text-xs font-medium text-slate-500">Report month<input aria-label="Report month" type="month" min="1900-01" max="9999-12" className="input mt-1" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && Number(event.target.value.slice(0, 4)) >= 1900) setMonth(event.target.value); }} /></label></div>}
        {tab === "Overview" && <>
          <SummaryCards expenses={expenses} />
          <section className="card"><div className="border-b border-slate-200 p-4 sm:p-5"><ExpenseFiltersBar filters={filters} onChange={setFilters} /></div><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5"><p className="text-sm text-slate-600">Showing <strong>{filtered.length}</strong> of {expenses.length} expenses · <strong>{formatCurrency(total)}</strong></p><button className="text-sm font-medium text-indigo-700 underline" onClick={() => setTab("Reports")}>Open monthly reports</button></div><ExpenseList expenses={filtered} hasAnyExpenses={expenses.length > 0} onEdit={expense => edit(expenses.find(row => row.id === expense.id)!)} onDelete={expense => setPendingDelete(expenses.find(row => row.id === expense.id)!)} /></section>
          <SpendingCharts expenses={filtered} />
          <p className="text-center text-xs text-slate-500">Stored in this browser. <button className="underline" onClick={() => setTab("Backup")}>Download a full backup</button> to preserve receipts and move your workspace.</p>
        </>}
        {tab === "Insights" && <><label className="label">Insights month<input type="month" className="input" value={month} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} /></label><MonthlyInsights workspace={workspace} month={month} /></>}
        {tab === "Integrations" && <Integrations />}
        {tab === "Coding agent" && <AgentJobs />}
        {tab === "Reports" && <Reports controller={controller} month={month} onEdit={edit} onReceipts={() => setTab("Receipts")} onReconcile={() => setTab("Reconcile")} />}
        {tab === "Receipts" && <ReceiptInbox controller={controller} onCreate={create} />}
        {tab === "Reconcile" && <Reconcile key={month} controller={controller} month={month} onCreate={create} onEdit={edit} />}
        <ChatAssistant expenses={expenses} month={month} financeVisible={tab === "Local AI"} toolsVisible={tab === "Tools"} popupOpen={chatOpen} onPopupChange={setChatOpen} onShowFinance={() => setTab("Local AI")} onShowTools={() => setTab("Tools")} onEdit={edit} />
        {tab === "Backup" && <><PortableBackup controller={controller} /><BackupAndHistory controller={controller} /></>}
      </>}
    </main>
    <footer className="px-4 pb-6 text-center text-xs text-slate-400">Local expense bookkeeping · USD · Review supporting records before closing a period.</footer>
    {exportOpen && <ExportDialog expenses={expenses} filters={filters} onClose={closeExport} />}
    {form && <Modal title={form.mode === "edit" ? "Edit expense" : "Add expense"} onClose={closeForm}>
      {feedback && <div className="mb-4"><Notice error={feedback.error}>{feedback.message}</Notice></div>}
      <ExpenseForm key={form.mode === "edit" ? form.expense.id : form.defaults?.receiptId || "new"} initial={form.mode === "edit" ? form.expense : undefined} defaults={form.mode === "add" ? form.defaults : undefined} rules={workspace.rules} onRememberRule={async (merchant, category) => { result(await controller.addRule(merchant, category), "Merchant category rule saved."); }} onSubmit={handleSubmit} onCancel={closeForm} />
      {saving && <p role="status" className="mt-3 text-sm text-slate-500">Saving…</p>}
    </Modal>}
    {pendingDelete && <Modal title="Delete expense?" onClose={closeDelete}><p className="text-sm text-slate-600">Remove <strong>{pendingDelete.description}</strong> ({formatCurrency(pendingDelete.amount)} on {formatDate(pendingDelete.date)})? You can undo the last change from Backup until another change is made.</p><div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" onClick={closeDelete}>Cancel</button><button className="btn-danger" onClick={async () => { result(await controller.deleteExpense(pendingDelete.id), "Expense deleted. You can undo this from Backup."); setPendingDelete(null); }}>Delete</button></div></Modal>}
  </div>;
}
