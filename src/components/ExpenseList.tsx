"use client";

import { Expense } from "@/types/expense";
import { formatCurrency, formatDate } from "@/lib/format";
import { CATEGORY_STYLES } from "@/lib/categoryStyles";

interface ExpenseListProps {
  expenses: Expense[];
  hasAnyExpenses: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

export default function ExpenseList({ expenses, hasAnyExpenses, onEdit, onDelete }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
            />
          </svg>
        </div>
        <p className="font-medium text-slate-700">
          {hasAnyExpenses ? "No expenses match your filters" : "No expenses yet"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {hasAnyExpenses
            ? "Try adjusting the search or date range."
            : "Add your first expense to start tracking your spending."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {expenses.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{e.description}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <CategoryBadge category={e.category} />
                <span>{formatDate(e.date)}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(e.amount)}</span>
              <RowActions expense={e} onEdit={onEdit} onDelete={onDelete} />
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDate(e.date)}</td>
                <td className="max-w-xs truncate px-5 py-3 font-medium text-slate-900" title={e.description}>
                  {e.description}
                </td>
                <td className="px-5 py-3">
                  <CategoryBadge category={e.category} />
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                  {formatCurrency(e.amount)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <RowActions expense={e} onEdit={onEdit} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CategoryBadge({ category }: { category: Expense["category"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CATEGORY_STYLES[category].badge}`}
    >
      {category}
    </span>
  );
}

function RowActions({
  expense,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  return (
    <div className="inline-flex gap-1">
      <button
        type="button"
        onClick={() => onEdit(expense)}
        className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
        aria-label={`Edit ${expense.description}`}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onDelete(expense)}
        className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
        aria-label={`Delete ${expense.description}`}
      >
        Delete
      </button>
    </div>
  );
}
