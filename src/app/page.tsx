"use client";

import { useCallback, useMemo, useState } from "react";
import {
  EMPTY_FILTERS,
  Expense,
  ExpenseFilters,
  ExpenseInput,
} from "@/types/expense";
import { useExpenses } from "@/hooks/useExpenses";
import { filterExpenses, sortByDateDesc, sumAmounts } from "@/lib/expenses";
import { formatCurrency, formatDate } from "@/lib/format";
import SummaryCards from "@/components/SummaryCards";
import SpendingCharts from "@/components/SpendingCharts";
import ExpenseFiltersBar from "@/components/ExpenseFilters";
import ExpenseList from "@/components/ExpenseList";
import ExpenseForm from "@/components/ExpenseForm";
import Modal from "@/components/Modal";
import ExportDialog from "@/components/ExportDialog";

type FormState = { mode: "add" } | { mode: "edit"; expense: Expense } | null;

export default function HomePage() {
  const { expenses, loaded, addExpense, updateExpense, deleteExpense } =
    useExpenses();
  const [filters, setFilters] = useState<ExpenseFilters>(EMPTY_FILTERS);
  const [form, setForm] = useState<FormState>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const filtered = useMemo(
    () => sortByDateDesc(filterExpenses(expenses, filters)),
    [expenses, filters],
  );
  const filteredTotal = useMemo(() => sumAmounts(filtered), [filtered]);

  const closeForm = useCallback(() => setForm(null), []);
  const closeDelete = useCallback(() => setPendingDelete(null), []);
  const closeExport = useCallback(() => setExportOpen(false), []);

  const handleSubmit = (data: ExpenseInput) => {
    if (form?.mode === "edit") updateExpense(form.expense.id, data);
    else addExpense(data);
    setForm(null);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3v18h18M7 15l4-4 3 3 5-6"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-slate-900">
                Expense Tracker
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Know where your money goes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={!loaded}
              className="btn-secondary"
              aria-haspopup="dialog"
            >
              Export Data
            </button>
            <button
              type="button"
              onClick={() => setForm({ mode: "add" })}
              className="btn-primary"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              <span>Add expense</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {!loaded ? (
          <div className="py-24 text-center text-sm text-slate-400">
            Loading your expenses…
          </div>
        ) : (
          <>
            <SummaryCards expenses={expenses} />

            <section className="card">
              <div className="border-b border-slate-200 p-4 sm:p-5">
                <ExpenseFiltersBar filters={filters} onChange={setFilters} />
              </div>
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-sm text-slate-600">
                  Showing{" "}
                  <span className="font-semibold text-slate-900">
                    {filtered.length}
                  </span>{" "}
                  of {expenses.length} expense{expenses.length === 1 ? "" : "s"}{" "}
                  ·{" "}
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(filteredTotal)}
                  </span>
                </p>
              </div>
              <ExpenseList
                expenses={filtered}
                hasAnyExpenses={expenses.length > 0}
                onEdit={(expense) => setForm({ mode: "edit", expense })}
                onDelete={setPendingDelete}
              />
            </section>

            <SpendingCharts expenses={filtered} />
          </>
        )}
      </main>

      {exportOpen && (
        <ExportDialog
          expenses={expenses}
          filters={filters}
          onClose={closeExport}
        />
      )}

      {form && (
        <Modal
          title={form.mode === "edit" ? "Edit expense" : "Add expense"}
          onClose={closeForm}
        >
          <ExpenseForm
            key={form.mode === "edit" ? form.expense.id : "new"}
            initial={form.mode === "edit" ? form.expense : undefined}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {pendingDelete && (
        <Modal title="Delete expense?" onClose={closeDelete}>
          <p className="text-sm text-slate-600">
            This will permanently remove{" "}
            <span className="font-medium text-slate-900">
              {pendingDelete.description}
            </span>{" "}
            ({formatCurrency(pendingDelete.amount)} on{" "}
            {formatDate(pendingDelete.date)}).
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDelete}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteExpense(pendingDelete.id);
                setPendingDelete(null);
              }}
              className="btn-danger"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
