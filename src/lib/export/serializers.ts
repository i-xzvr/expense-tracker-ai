import { toISODate } from "@/lib/format";
import { ExpenseReport, ExportFormat } from "@/lib/export/report";

export type { ExportFormat } from "@/lib/export/report";

export interface ExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

function csvCell(value: string): string {
  // Spreadsheet apps can interpret formulas even after leading whitespace.
  const safe =
    /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
      ? `'${value}`
      : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildExportFile(
  report: ExpenseReport,
  format: ExportFormat,
): ExportFile {
  if (!report.expenses.length) {
    throw new Error("There are no expenses in this selection to export.");
  }
  const generatedAt = new Date(report.generatedAt);
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new Error("The report date is invalid. Please try again.");
  }
  const basename = `expenses-${report.scope}-${toISODate(generatedAt)}`;

  if (format === "csv") {
    const rows = [
      ["Date", "Category", "Amount", "Description"],
      ...report.expenses.map((expense) => [
        expense.date,
        expense.category,
        expense.amount.toFixed(2),
        expense.description,
      ]),
    ];
    return {
      filename: `${basename}.csv`,
      mimeType: "text/csv;charset=utf-8",
      // BOM allows spreadsheet applications to detect UTF-8 reliably.
      content: `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`,
    };
  }
  if (format === "json") {
    return {
      filename: `${basename}.json`,
      mimeType: "application/json;charset=utf-8",
      content: `${JSON.stringify(report, null, 2)}\n`,
    };
  }
  throw new Error("Choose CSV or JSON as the export format.");
}
