import { CATEGORIES, Category, Expense, ExpenseFilters, ExpenseInput } from "@/types/expense";
import { monthKey, parseISODate, todayISO } from "@/lib/format";

export type ValidationErrors = Partial<Record<keyof ExpenseInput, string>>;

export interface ExpenseFormValues {
  date: string;
  amount: string;
  category: Category | "";
  description: string;
}

export const MAX_AMOUNT = 1_000_000;
export const MAX_DESCRIPTION = 120;

export function validateExpense(values: ExpenseFormValues): {
  errors: ValidationErrors;
  data?: ExpenseInput;
} {
  const errors: ValidationErrors = {};

  if (!values.date) {
    errors.date = "Date is required.";
  } else if (!parseISODate(values.date)) {
    errors.date = "Enter a valid date.";
  } else if (values.date > todayISO()) {
    errors.date = "Date cannot be in the future.";
  }

  const amountText = values.amount.trim();
  const amount = Number(amountText);
  if (!amountText) {
    errors.amount = "Amount is required.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount)) {
    errors.amount = "Enter a number with up to 2 decimal places.";
  } else if (amount <= 0) {
    errors.amount = "Amount must be greater than zero.";
  } else if (amount > MAX_AMOUNT) {
    errors.amount = "Amount must be $1,000,000 or less.";
  }

  if (!values.category) {
    errors.category = "Choose a category.";
  }

  const description = values.description.trim();
  if (!description) {
    errors.description = "Description is required.";
  } else if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keep it under ${MAX_DESCRIPTION} characters.`;
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    data: {
      date: values.date,
      amount: Math.round(amount * 100) / 100,
      category: values.category as Category,
      description,
    },
  };
}

export function filterExpenses(expenses: Expense[], filters: ExpenseFilters): Expense[] {
  const query = filters.search.trim().toLowerCase();
  return expenses.filter((e) => {
    if (filters.category !== "All" && e.category !== filters.category) return false;
    if (filters.startDate && e.date < filters.startDate) return false;
    if (filters.endDate && e.date > filters.endDate) return false;
    if (
      query &&
      !e.description.toLowerCase().includes(query) &&
      !e.category.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });
}

export function sortByDateDesc(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  );
}

export function sumAmounts(expenses: Expense[]): number {
  return Math.round(expenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
}

export function totalsByCategory(expenses: Expense[]): { category: Category; total: number }[] {
  const totals = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
  for (const e of expenses) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  return CATEGORIES.map((category) => ({ category, total: totals.get(category) ?? 0 }));
}

/** Totals for the last `count` calendar months ending with the current month. */
export function totalsByMonth(
  expenses: Expense[],
  count: number,
  now: Date = new Date(),
): { month: string; total: number }[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const totals = new Map(months.map((m) => [m, 0]));
  for (const e of expenses) {
    const key = monthKey(e.date);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  return months.map((month) => ({ month, total: totals.get(month) ?? 0 }));
}
