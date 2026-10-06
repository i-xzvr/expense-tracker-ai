import { Expense, isCategory } from "@/types/expense";
import { parseISODate } from "@/lib/format";

export const STORAGE_KEY = "expense-tracker:expenses:v1";

function isExpense(value: unknown): value is Expense {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.date === "string" &&
    parseISODate(e.date) !== null &&
    typeof e.amount === "number" &&
    Number.isFinite(e.amount) &&
    isCategory(e.category) &&
    typeof e.description === "string" &&
    typeof e.createdAt === "number"
  );
}

export function loadExpenses(): Expense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isExpense) : [];
  } catch {
    return [];
  }
}

export function saveExpenses(expenses: Expense[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch {
    // Storage may be full or unavailable (e.g. private mode); keep in-memory state.
  }
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
