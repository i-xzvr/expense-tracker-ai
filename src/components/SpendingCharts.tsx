"use client";

import { useMemo } from "react";
import { Expense } from "@/types/expense";
import { sumAmounts, totalsByCategory, totalsByMonth } from "@/lib/expenses";
import { formatCurrency, formatMonthKey } from "@/lib/format";
import { CATEGORY_STYLES } from "@/lib/categoryStyles";

export default function SpendingCharts({ expenses }: { expenses: Expense[] }) {
  const { byCategory, byMonth, total, maxCategory, maxMonth } = useMemo(() => {
    const byCategory = totalsByCategory(expenses).sort((a, b) => b.total - a.total);
    const byMonth = totalsByMonth(expenses, 6);
    return {
      byCategory,
      byMonth,
      total: sumAmounts(expenses),
      maxCategory: Math.max(...byCategory.map((c) => c.total), 0),
      maxMonth: Math.max(...byMonth.map((m) => m.total), 0),
    };
  }, [expenses]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Spending by category</h2>
        <p className="text-sm text-slate-500">Based on the current filters</p>
        {total === 0 ? (
          <EmptyChart />
        ) : (
          <ul className="mt-5 space-y-3">
            {byCategory.map(({ category, total: value }) => (
              <li key={category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{category}</span>
                  <span className="tabular-nums text-slate-600">
                    {formatCurrency(value)}
                    <span className="ml-2 text-xs text-slate-400">
                      {Math.round((value / total) * 100)}%
                    </span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${CATEGORY_STYLES[category].bar} transition-all`}
                    style={{ width: `${maxCategory ? (value / maxCategory) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Monthly trend</h2>
        <p className="text-sm text-slate-500">Last 6 months, based on the current filters</p>
        {maxMonth === 0 ? (
          <EmptyChart />
        ) : (
          <div className="mt-5 flex h-52 items-end gap-2 sm:gap-4">
            {byMonth.map(({ month, total: value }) => (
              <div key={month} className="flex h-full flex-1 flex-col items-center justify-end">
                <span className="mb-1 text-[11px] tabular-nums text-slate-500">
                  {value > 0 ? formatCurrency(Math.round(value)).replace(/\.00$/, "") : ""}
                </span>
                <div
                  className="w-full max-w-[3rem] rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all"
                  style={{ height: `${(value / maxMonth) * 85}%`, minHeight: value > 0 ? 4 : 0 }}
                  title={`${formatMonthKey(month, "long")}: ${formatCurrency(value)}`}
                />
                <span className="mt-2 text-xs text-slate-500">{formatMonthKey(month)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="mt-5 flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
      No data to display
    </div>
  );
}
