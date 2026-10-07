import type { QueryPlan } from "./query";
import { monthPeriod } from "./query";
import { CATEGORIES, type Category } from "../../types/expense";

type Period = "month" | "previous" | "all" | "year";
type ReportQuestion = { id: string; label: string; question: string; intent: QueryPlan["intent"]; period: Period; category?: Category; comparison?: "month" | "year" };

/** Curated questions stay editable; only the complete known wording gets a built-in plan. */
export const REPORT_QUESTIONS: readonly ReportQuestion[] = [
  { id: "summary", label: "Expense overview", question: "Tell me about my expenses", intent: "categories", period: "month" },
  { id: "total-month", label: "Total spending — report month", question: "How much did I spend this month?", intent: "total", period: "month" },
  { id: "total-previous", label: "Total spending — previous month", question: "How much did I spend last month?", intent: "total", period: "previous" },
  { id: "total-all", label: "Total spending — all time", question: "How much did I spend all time?", intent: "total", period: "all" },
  { id: "total-year", label: "Spending — year through report month", question: "Total my spending from January through the selected report month", intent: "total", period: "year" },
  { id: "list-month", label: "Expense records — report month", question: "List my expenses this month", intent: "list", period: "month" },
  { id: "list-previous", label: "Expense records — previous month", question: "List my expenses last month", intent: "list", period: "previous" },
  { id: "list-all", label: "Expense records — all time", question: "List all my recorded expenses", intent: "list", period: "all" },
  { id: "categories-previous", label: "Category breakdown — previous month", question: "Break down last month's spending by category", intent: "categories", period: "previous" },
  { id: "categories-all", label: "Category breakdown — all time", question: "Break down all-time spending by category", intent: "categories", period: "all" },
  { id: "merchants-month", label: "Merchant spending — report month", question: "Group this month's spending by merchant", intent: "merchant", period: "month" },
  { id: "merchants-all", label: "Merchant spending — all time", question: "Group all-time spending by merchant", intent: "merchant", period: "all" },
  { id: "recurring-month", label: "Repeated merchant payments — report month", question: "Find repeated merchant payments this month", intent: "recurring", period: "month" },
  { id: "recurring-all", label: "Repeated merchant payments — all time", question: "Find repeated merchant payments all time", intent: "recurring", period: "all" },
  { id: "compare-month", label: "Compare report month with previous month", question: "Compare this month with last month", intent: "compare", period: "month", comparison: "month" },
  { id: "compare-year", label: "Compare year through report month with prior year", question: "Compare January through the report month with the same months last year", intent: "compare", period: "year", comparison: "year" },
  ...CATEGORIES.map(category => ({ id: `category-${category.toLowerCase()}`, label: `${category} spending — report month`, question: `How much did I spend on ${category} this month?`, intent: "total" as const, period: "month" as const, category })),
];

const normalize = (text: string) => text.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ").replace(/[.!?]+$/, "");
export function reportQuestionPlan(question: string, month: string): QueryPlan | null {
  const report = REPORT_QUESTIONS.find(item => normalize(item.question) === normalize(question));
  if (!report) return null;
  const current = monthPeriod(month);
  const previousDate = new Date(`${current.from}T00:00:00.000Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const year = Number(month.slice(0, 4));
  if (((report.period === "previous" || report.comparison === "month") && previousDate.getUTCFullYear() < 1900) || (report.comparison === "year" && year <= 1900)) return null;
  const previous = monthPeriod(previousDate.toISOString().slice(0, 7));
  const period = report.period === "previous" ? previous : report.period === "year" ? { from: `${year}-01-01`, to: current.to } : current;
  const comparison = report.comparison === "month" ? previous : report.comparison === "year" ? { from: `${year - 1}-01-01`, to: monthPeriod(`${year - 1}-${month.slice(5)}`).to } : null;
  return { intent: report.intent, allTime: report.period === "all", from: report.period === "all" ? null : period.from, to: report.period === "all" ? null : period.to, category: report.category ?? null, merchant: null, search: null, compareFrom: comparison?.from ?? null, compareTo: comparison?.to ?? null };
}
