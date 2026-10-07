import type { StatementLine } from "../../types/accounting";
import { parseISODate } from "../format";

export type ImportedStatementLine = Pick<StatementLine, "date" | "description" | "amountCents">;

/** RFC-style quoted CSV: commas, doubled quotes and embedded newlines are supported. */
export function parseStatementCsv(text: string): ImportedStatementLine[] {
  if (text.length > 2_000_000) throw new Error("Statement CSV exceeds the 2 MB limit.");
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let afterQuote = false;
  const pushCell = () => { row.push(cell); cell = ""; afterQuote = false; };
  const pushRow = () => { pushCell(); if (row.some((v) => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else cell += ch;
    } else if (ch === '"') {
      if (cell || afterQuote) throw new Error("CSV has an unexpected quote.");
      quoted = true;
    } else if (ch === ",") pushCell();
    else if (ch === "\r" || ch === "\n") { if (ch === "\r" && input[i + 1] === "\n") i++; pushRow(); }
    else { if (afterQuote) throw new Error("CSV has characters after a closing quote."); cell += ch; }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (cell || row.length || afterQuote) pushRow();
  if (!rows.length || rows[0].map((v) => v.trim().toLowerCase()).join(",") !== "date,description,amount") throw new Error("CSV header must be Date,Description,Amount. Use YYYY-MM-DD dates and negative amounts for money out.");
  if (rows.length < 2) throw new Error("Statement CSV has no transactions.");
  if (rows.length > 10_001) throw new Error("Statement CSV supports at most 10,000 transactions.");
  return rows.slice(1).map((fields, index) => {
    const label = `CSV row ${index + 2}`;
    if (fields.length !== 3) throw new Error(`${label} must have exactly three columns.`);
    const [date, description, raw] = fields.map((v) => v.trim());
    if (!parseISODate(date)) throw new Error(`${label} has an invalid YYYY-MM-DD date.`);
    if (!description || description.length > 2_000) throw new Error(`${label} needs a description of at most 2,000 characters.`);
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error(`${label} amount must be a number with at most two decimal places, without currency symbols or separators.`);
    const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
    const amountCents = (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (raw.startsWith("-") ? -1 : 1);
    if (!Number.isSafeInteger(amountCents) || Math.abs(amountCents) > 1_000_000_000_000 || amountCents === 0) throw new Error(`${label} amount is zero or outside the supported range.`);
    return { date, description, amountCents };
  });
}
