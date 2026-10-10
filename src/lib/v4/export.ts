import { buildExpenseReport, type ExpenseReport, type ExportScope } from "../export/report";
import { buildExportFile } from "../export/serializers";
import { emptyWorkspace, validateWorkspace } from "../accounting/validation";
import { isObject } from "../ai/validation";
import { isCategory, type ExpenseFilters } from "../../types/expense";
import { V4Error } from "./http";

export type V4Format = "csv" | "json" | "pdf";
export const templates = ["Detailed expenses", "Monthly Summary", "Category Analysis", "Tax Report"] as const;
export type ReportTemplate = typeof templates[number];
export interface ExportRequest {
  expenses: ExpenseReport["expenses"]; scope: ExportScope; filters: ExpenseFilters;
  generatedAt: string; format: V4Format; filename: string; template: ReportTemplate;
}
export function exportFilename(input: string, format: V4Format): string {
  const name = input.trim().replace(/\.(csv|json|pdf)$/i, "");
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new V4Error(400, "INVALID_FILENAME", "Use 1–100 characters without path separators or reserved Windows names.");
  return name + "." + format;
}
export function validateExport(input: unknown): { request: ExportRequest; report: ExpenseReport } {
  if (!isObject(input) || !["csv","json","pdf"].includes(String(input.format)) || !templates.includes(input.template as ReportTemplate) || !isObject(input.filters) || typeof input.filename !== "string" || typeof input.generatedAt !== "string" || !["all","filtered"].includes(String(input.scope))) throw new V4Error(400, "INVALID_EXPORT", "Choose a valid format, template, selection and filename.");
  const filters = input.filters;
  if (typeof filters.search !== "string" || filters.search.length > 500 || typeof filters.startDate !== "string" || typeof filters.endDate !== "string" || !(filters.category === "All" || isCategory(filters.category))) throw new V4Error(400, "INVALID_FILTERS", "Export filters are invalid.");
  if (!Array.isArray(input.expenses) || input.expenses.length > 10_000) throw new V4Error(400, "INVALID_EXPENSES", "Export at most 10,000 expenses.");
  try {
    const fields = ["id","date","amount","category","description","createdAt","merchant","project","account","reimbursement","reviewed"];
    const rows = input.expenses.map(row => {
      if (!isObject(row)) throw new Error("An expense is invalid.");
      return Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
    });
    const expenses = validateWorkspace({ ...emptyWorkspace(), expenses: rows }).expenses.map((row,index) => {
      const receiptId = (input.expenses as Record<string,unknown>[])[index].receiptId;
      if (receiptId !== undefined && (typeof receiptId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(receiptId))) throw new Error("Invalid receipt reference.");
      return receiptId === undefined ? row : { ...row, receiptId: receiptId as string };
    });
    const request: ExportRequest = { expenses, scope: input.scope as ExportScope,
      filters: {search:filters.search as string,category:filters.category as ExpenseFilters["category"],startDate:filters.startDate as string,endDate:filters.endDate as string},
      generatedAt:input.generatedAt,format:input.format as V4Format,filename:input.filename,template:input.template as ReportTemplate };
    exportFilename(request.filename, request.format);
    const report = buildExpenseReport(expenses, { scope: request.scope, filters: request.filters, now: new Date(request.generatedAt) });
    if (!report.summary.count) throw new Error("There are no expenses in this selection.");
    return { request, report };
  } catch (error) {
    if (error instanceof V4Error) throw error;
    throw new V4Error(400, "INVALID_EXPORT", error instanceof Error ? error.message : "The export is invalid.");
  }
}
export async function generateExport(request: ExportRequest, report: ExpenseReport): Promise<{ bytes: Uint8Array; mime: string; filename: string; warnings: string[] }> {
  const filename = exportFilename(request.filename, request.format);
  if (request.format === "pdf") {
    const { renderPdf } = await import("./pdf");
    const pdf = await renderPdf(report, request.template);
    return { ...pdf, mime: "application/pdf", filename };
  }
  const file = buildExportFile(report, request.format);
  const content = request.format === "json" ? JSON.stringify({ ...report, reportTemplate: request.template }, null, 2) + "\n" : file.content;
  return { bytes: new TextEncoder().encode(content), mime: file.mimeType, filename, warnings: [] };
}
