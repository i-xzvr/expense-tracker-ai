import type { Expense } from "../../types/expense";
import { emptyWorkspace, validateWorkspace } from "./validation";

/** Import only actual V2 expense rows; computed summaries are never trusted. */
export function parseV2ExpenseReport(raw: string): Expense[] {
  if (raw.length > 10_000_000) throw new Error("V2 expense export exceeds the 10 MB limit.");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("V2 export is not valid JSON."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a V2 JSON expense export.");
  const report = input as Record<string, unknown>;
  if (report.schemaVersion !== 1 || report.currency !== "USD" || !Array.isArray(report.expenses)) throw new Error("Choose a V2 schema version 1 JSON expense export in USD.");
  const fields = ["id", "date", "amount", "category", "description", "createdAt"];
  for (const expense of report.expenses) {
    if (!expense || typeof expense !== "object" || Array.isArray(expense)) throw new Error("V2 export contains an invalid expense.");
    if (Object.keys(expense).some((key) => !fields.includes(key))) throw new Error("V2 expense contains unsupported fields. Use workspace restore for a V3 backup.");
  }
  return validateWorkspace({ ...emptyWorkspace(), expenses: report.expenses }).expenses;
}
