"use client";

import { useId, useMemo, useState } from "react";
import { Expense, ExpenseFilters } from "@/types/expense";
import { filterExpenses } from "@/lib/expenses";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  buildExpenseReport,
  ExportFormat,
  ExportScope,
} from "@/lib/export/report";
import { buildExportFile } from "@/lib/export/serializers";
import { downloadExportFile } from "@/lib/export/download";
import Modal from "@/components/Modal";

interface ExportDialogProps {
  expenses: Expense[];
  filters: ExpenseFilters;
  onClose: () => void;
}

export default function ExportDialog({
  expenses,
  filters,
  onClose,
}: ExportDialogProps) {
  const id = useId();
  const hasFilters = !!(
    filters.search.trim() ||
    filters.category !== "All" ||
    filters.startDate ||
    filters.endDate
  );
  const [scope, setScope] = useState<ExportScope>(
    hasFilters ? "filtered" : "all",
  );
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [generatedAt] = useState(() => new Date());
  const [feedback, setFeedback] = useState<{
    kind: "status" | "alert";
    text: string;
  } | null>(null);
  const filteredCount = useMemo(
    () => filterExpenses(expenses, filters).length,
    [expenses, filters],
  );
  const result = useMemo(() => {
    try {
      return {
        report: buildExpenseReport(expenses, {
          scope,
          filters,
          now: generatedAt,
        }),
        error: null,
      };
    } catch (error) {
      return {
        report: null,
        error:
          error instanceof Error
            ? error.message
            : "These expenses could not be prepared for export.",
      };
    }
  }, [expenses, filters, scope, generatedAt]);
  const report = result.report;
  const filterDescription = [
    filters.category !== "All" ? filters.category : null,
    filters.startDate ? `From ${formatDate(filters.startDate)}` : null,
    filters.endDate ? `Through ${formatDate(filters.endDate)}` : null,
    filters.search.trim() ? `Search: “${filters.search.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function download() {
    if (!report || report.summary.count === 0) return;
    try {
      const file = buildExportFile(report, format);
      downloadExportFile(file);
      setFeedback({
        kind: "status",
        text: `Download started: ${file.filename}. Check your browser’s downloads.`,
      });
    } catch (error) {
      setFeedback({
        kind: "alert",
        text:
          error instanceof Error
            ? error.message
            : "The download could not start. Please try again.",
      });
    }
  }

  return (
    <Modal title="Export expenses" onClose={onClose} size="wide">
      <p className="mb-6 text-sm text-slate-600">
        Choose what to include, check the preview, and take your data with you.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-900">
            1. Choose expenses
          </legend>
          <div className="space-y-2">
            {(
              [
                {
                  value: "all",
                  title: "All expenses",
                  description: `${expenses.length} saved expense${expenses.length === 1 ? "" : "s"}`,
                },
                {
                  value: "filtered",
                  title: "Current results",
                  description: `${filteredCount} matching expense${filteredCount === 1 ? "" : "s"}`,
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${scope === option.value ? "border-indigo-500 bg-indigo-50/60" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <input
                  type="radio"
                  name={`${id}-scope`}
                  value={option.value}
                  checked={scope === option.value}
                  onChange={() => {
                    setScope(option.value);
                    setFeedback(null);
                  }}
                  className="mt-1 h-4 w-4 accent-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {option.title}
                  </span>
                  <span className="block text-xs text-slate-600">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-900">
            2. Choose a format
          </legend>
          <div className="space-y-2">
            {(
              [
                {
                  value: "csv",
                  title: "CSV",
                  description: "For Excel, Sheets, and other spreadsheets",
                },
                {
                  value: "json",
                  title: "JSON",
                  description: "Full records and export details",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${format === option.value ? "border-indigo-500 bg-indigo-50/60" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <input
                  type="radio"
                  name={`${id}-format`}
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => {
                    setFormat(option.value);
                    setFeedback(null);
                  }}
                  className="mt-1 h-4 w-4 accent-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {option.title}
                  </span>
                  <span className="block text-xs text-slate-600">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="mt-3 break-words text-xs leading-relaxed text-slate-500">
        {scope === "all"
          ? "Includes every saved expense, regardless of dashboard filters."
          : filterDescription ||
            "No dashboard filters applied. Current results include all expenses."}
      </p>

      {result.error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
        >
          {result.error}
        </p>
      ) : (
        report && (
          <section className="mt-5" aria-labelledby={`${id}-preview`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3
                id={`${id}-preview`}
                className="text-sm font-semibold text-slate-900"
              >
                3. Check your export
              </h3>
              <span className="text-xs text-slate-500">
                Newest expenses first
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Expenses included</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {report.summary.count}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Total (USD)</p>
                <p className="mt-1 break-words text-xl font-semibold tabular-nums">
                  {formatCurrency(report.summary.totalCents / 100)}
                </p>
              </div>
              {report.summary.startDate && report.summary.endDate && (
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {formatDate(report.summary.startDate)} –{" "}
                  {formatDate(report.summary.endDate)}
                </p>
              )}
            </div>

            {report.summary.count === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm font-medium text-slate-800">
                  No expenses to export
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {expenses.length === 0
                    ? "Add an expense to get started."
                    : "Choose All expenses, or close this dialog and adjust your dashboard filters."}
                </p>
              </div>
            ) : (
              <>
                <div
                  className="mt-3 overflow-x-auto rounded-xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                  tabIndex={0}
                  role="region"
                  aria-label="Expense preview, scroll horizontally if needed"
                >
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <caption className="sr-only">
                      Preview of the first {Math.min(report.summary.count, 5)}{" "}
                      expense{report.summary.count === 1 ? "" : "s"}. The
                      download includes {report.summary.count} selected expense
                      {report.summary.count === 1 ? "" : "s"}.
                    </caption>
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Date
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Category
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-medium"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.expenses.slice(0, 5).map((expense, index) => (
                        <tr key={`${expense.id}-${index}`}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                            {formatDate(expense.date)}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">
                            {expense.category}
                          </td>
                          <td className="max-w-[240px] whitespace-pre-wrap break-words px-3 py-2.5 text-slate-800">
                            {expense.description}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            {formatCurrency(expense.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {report.summary.count > 5
                    ? `Previewing 5 of ${report.summary.count} expenses. All ${report.summary.count} will be exported.`
                    : `All ${report.summary.count} selected expense${report.summary.count === 1 ? " is" : "s are"} shown.`}
                </p>
              </>
            )}
          </section>
        )
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {format === "csv"
          ? "CSV includes date, category, amount in USD, and description. Spreadsheet formula-like text is protected."
          : "JSON preserves every selected record, including IDs and creation timestamps, with totals and the filters used."}
      </p>
      <div aria-live="polite" aria-atomic="true" className="mt-3">
        {feedback && (
          <p
            role={feedback.kind}
            className={`break-words rounded-lg p-3 text-sm ${feedback.kind === "alert" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}
          >
            {feedback.text}
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Created on this device. Nothing is uploaded.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1 sm:flex-none"
          >
            Close
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!report || report.summary.count === 0}
            className="btn-primary flex-1 sm:flex-none"
          >
            Download {format.toUpperCase()}
          </button>
        </div>
      </div>
    </Modal>
  );
}
