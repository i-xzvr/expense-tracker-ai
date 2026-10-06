"use client";

import { useMemo } from "react";
import { Expense } from "@/types/expense";
import { sumAmounts, totalsByCategory } from "@/lib/expenses";
import { formatCurrency, formatMonthKey, monthKey, todayISO } from "@/lib/format";

export default function SummaryCards({ expenses }: { expenses: Expense[] }) {
  const stats = useMemo(() => {
    const currentMonth = monthKey(todayISO());
    const monthly = expenses.filter((e) => monthKey(e.date) === currentMonth);
    const top = totalsByCategory(expenses).reduce((best, c) => (c.total > best.total ? c : best), {
      category: null as string | null,
      total: 0,
    });
    return {
      total: sumAmounts(expenses),
      count: expenses.length,
      monthly: sumAmounts(monthly),
      monthlyCount: monthly.length,
      monthLabel: formatMonthKey(currentMonth, "long"),
      top,
    };
  }, [expenses]);

  const cards = [
    {
      label: "Total spending",
      value: formatCurrency(stats.total),
      hint: `${stats.count} expense${stats.count === 1 ? "" : "s"} recorded`,
      accent: "from-indigo-500 to-violet-500",
    },
    {
      label: "This month",
      value: formatCurrency(stats.monthly),
      hint: `${stats.monthLabel} · ${stats.monthlyCount} expense${stats.monthlyCount === 1 ? "" : "s"}`,
      accent: "from-sky-500 to-cyan-500",
    },
    {
      label: "Top category",
      value: stats.top.category ?? "—",
      hint: stats.top.category
        ? `${formatCurrency(stats.top.total)} · ${Math.round((stats.top.total / stats.total) * 100)}% of total`
        : "No spending yet",
      accent: "from-amber-500 to-orange-500",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="card relative overflow-hidden p-5">
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
          <p className="text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {card.value}
          </p>
          <p className="mt-1 text-sm text-slate-500">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
