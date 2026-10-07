import { filterExpenses, sortByDateDesc } from "@/lib/expenses";
import { parseISODate } from "@/lib/format";
import { CATEGORIES, Category, Expense, ExpenseFilters } from "@/types/expense";

export type ExportScope = "all" | "filtered";
export type ExportFormat = "csv" | "json";

/** A detached, deterministic report shared by previews and export formats. */
export interface ExpenseReport {
  schemaVersion: 1;
  generatedAt: string;
  currency: "USD";
  scope: ExportScope;
  filters: ExpenseFilters | null;
  expenses: Expense[];
  summary: {
    count: number;
    totalCents: number;
    startDate: string | null;
    endDate: string | null;
    categoryTotals: { category: Category; count: number; totalCents: number }[];
  };
}

function amountToCents(amount: number): number {
  const cents = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(cents) ||
    cents / 100 !== amount
  ) {
    throw new Error(
      "An expense has an invalid amount. Use a positive amount with up to two decimal places.",
    );
  }
  return cents;
}

function validateFilters(filters: ExpenseFilters): void {
  if (filters.startDate && !parseISODate(filters.startDate)) {
    throw new Error(
      "Choose a valid start date before exporting filtered results.",
    );
  }
  if (filters.endDate && !parseISODate(filters.endDate)) {
    throw new Error(
      "Choose a valid end date before exporting filtered results.",
    );
  }
  if (
    filters.startDate &&
    filters.endDate &&
    filters.startDate > filters.endDate
  ) {
    throw new Error("The start date must be on or before the end date.");
  }
}

export function buildExpenseReport(
  expenses: Expense[],
  options: { scope: ExportScope; filters: ExpenseFilters; now?: Date },
): ExpenseReport {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("The report date is invalid. Please try again.");
  }
  if (options.scope !== "all" && options.scope !== "filtered") {
    throw new Error("Choose all expenses or filtered results to export.");
  }
  const filters = options.scope === "filtered" ? { ...options.filters } : null;
  if (filters) validateFilters(filters);
  const selected = filters ? filterExpenses(expenses, filters) : expenses;
  const rows = sortByDateDesc(selected).map((expense) => ({ ...expense }));
  const categoryTotals = CATEGORIES.map((category) => ({
    category,
    count: 0,
    totalCents: 0,
  }));
  let totalCents = 0;

  for (const expense of rows) {
    if (!parseISODate(expense.date)) {
      throw new Error(
        "An expense has an invalid date. Correct it before exporting.",
      );
    }
    const category = categoryTotals.find(
      (entry) => entry.category === expense.category,
    );
    if (!category) {
      throw new Error(
        "An expense has an invalid category. Correct it before exporting.",
      );
    }
    const cents = amountToCents(expense.amount);
    totalCents += cents;
    if (!Number.isSafeInteger(totalCents)) {
      throw new Error(
        "The selected total is too large to export accurately. Select fewer expenses.",
      );
    }
    category.count += 1;
    category.totalCents += cents;
  }

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    currency: "USD",
    scope: options.scope,
    filters,
    expenses: rows,
    summary: {
      count: rows.length,
      totalCents,
      startDate: rows.length ? rows[rows.length - 1].date : null,
      endDate: rows.length ? rows[0].date : null,
      categoryTotals,
    },
  };
}
