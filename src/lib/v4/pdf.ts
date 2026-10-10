import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExpenseReport } from "../export/report";
import type { ReportTemplate } from "./export";

export async function renderPdf(report: ExpenseReport, template: ReportTemplate, fontBytes?: Uint8Array) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes ?? await readFile(join(process.cwd(), "public", "fonts", "NotoSans.ttf")), { subset: true });
  const supported = new Set(font.getCharacterSet());
  let replaced = false;
  const safe = (text: string) => Array.from(text).map(char => {
    if (supported.has(char.codePointAt(0)!)) return char;
    replaced = true; return "?";
  }).join("");
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page!: ReturnType<typeof doc.addPage>, y = 785;
  const newPage = () => { page = doc.addPage([595.28, 841.89]); pages.push(page); y = 785; };
  newPage();
  function line(text: string, size = 10, color = rgb(.13,.17,.25)) {
    const clean = safe(text);
    const parts = wrap(clean, font, size, 490);
    for (const part of parts) {
      if (y < 65) newPage();
      page.drawText(part, { x: 50, y, font, size, color });
      y -= size + 6;
    }
  }
  const money = (cents: number) => "$" + (cents / 100).toFixed(2);
  line("Expense Tracker V4", 21, rgb(.25,.25,.65));
  line(template, 16);
  line("Generated " + report.generatedAt);
  line("USD · " + report.summary.count + " expenses · " + money(report.summary.totalCents), 13);
  line("Period: " + (report.summary.startDate ?? "—") + " to " + (report.summary.endDate ?? "—"));
  if (report.filters) line("Filters: " + JSON.stringify(report.filters));
  y -= 10;
  if (template === "Tax Report") line("Expense records for review. This report does not determine tax deductibility.");
  if (template === "Monthly Summary") {
    const months = new Map<string, number>();
    for (const row of report.expenses) { const month = row.date.slice(0,7); months.set(month, (months.get(month) ?? 0) + Math.round(row.amount * 100)); }
    line("Monthly totals", 13);
    for (const [month,total] of [...months].sort(([a],[b]) => a.localeCompare(b))) line(month + ": " + money(total));
    y -= 8;
  }
  line("Category totals", 13);
  for (const item of report.summary.categoryTotals.filter(item => item.count)) line(item.category + ": " + item.count + " · " + money(item.totalCents) + (template === "Category Analysis" ? " · " + (item.totalCents / report.summary.totalCents * 100).toFixed(1) + "%" : ""));
  y -= 12;
  line("Selected expenses", 13);
  for (const row of report.expenses) {
    line(row.date + " · " + row.category + " · " + money(Math.round(row.amount * 100)), 10);
    line(row.description.replace(/\r?\n/g, " / "), 9);
    y -= 3;
  }
  pages.forEach((item, index) => item.drawText((index + 1) + " / " + pages.length, { x: 50, y: 35, font, size: 9 }));
  doc.setTitle(template + " — Expense Tracker V4");
  doc.setSubject("Deterministic financial report in USD");
  return { bytes: await doc.save(), warnings: replaced ? ["Some characters are unavailable in the PDF font and appear as ?. CSV and JSON retain the original text."] : [] };
}
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []; let line = "";
  // Hard-wrap also handles exceptionally long words without clipping or losing characters.
  for (const char of Array.from(text)) {
    if (line && font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ""; }
    line += char;
  }
  lines.push(line); return lines;
}
