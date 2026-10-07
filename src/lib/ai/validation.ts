import { isCategory } from "../../types/expense";
import type { AccountingExpense } from "../../types/accounting";

export class AIError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AIError";
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function hasControlCharacters(value: string, allowWhitespace = false): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32 && !(allowWhitespace && [9, 10, 13].includes(character.charCodeAt(0))));
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01";
}

function shortText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !hasControlCharacters(value, true);
}

export function validateQuery(value: unknown): { question: string; month: string; expenses: AccountingExpense[] } {
  const invalid = () => { throw new AIError(400, "INVALID_QUERY", "Use a question of 1–1,000 characters, a valid month, and at most 10,000 valid expenses."); };
  if (!isObject(value) || !shortText(value.question, 1000) || typeof value.month !== "string" || !/^\d{4}-\d{2}$/.test(value.month) || !isCalendarDate(`${value.month}-01`) || !Array.isArray(value.expenses) || value.expenses.length > 10_000) return invalid();
  const ids = new Set<string>();
  const expenses: AccountingExpense[] = value.expenses.map((row: unknown) => {
    if (!isObject(row) || !shortText(row.id, 160) || ids.has(row.id) || !isCalendarDate(row.date) || !isCategory(row.category) || !shortText(row.description, 120) || typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 1_000_000 || Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.000001 || typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt) || row.createdAt < 0 || (row.merchant !== undefined && (typeof row.merchant !== "string" || row.merchant.length > 120))) return invalid();
    ids.add(row.id);
    // Copy only fields the read-only query needs. Receipt data and metadata never enter the model prompt.
    return { id: row.id, date: row.date, category: row.category, description: row.description, amount: row.amount, createdAt: row.createdAt, merchant: typeof row.merchant === "string" ? row.merchant : undefined };
  });
  return { question: value.question.trim(), month: value.month, expenses };
}

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export function validateReceiptImage(value: unknown): string {
  const invalid = () => { throw new AIError(400, "INVALID_IMAGE", "Choose a valid JPEG, PNG, or WebP image up to 1.5 MiB."); };
  if (!isObject(value) || typeof value.image !== "string" || value.image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) return invalid();
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.image);
  if (!match || match[2].length % 4 !== 0) return invalid();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES || bytes.length < 12 || bytes.toString("base64") !== match[2]) return invalid();
  const actual = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (actual !== match[1]) return invalid();
  return match[2];
}

/** Read at most the limit even when a client omits or lies about Content-Length. */
export async function readBoundedJson(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<unknown> {
  if (!stream) throw new AIError(400, "INVALID_JSON", "A JSON request body is required.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new AIError(413, "BODY_TOO_LARGE", "The request is too large. Use fewer records or a smaller receipt image.");
      }
      chunks.push(value);
    }
    const merged = Buffer.concat(chunks);
    try { return JSON.parse(merged.toString("utf8")); }
    catch { throw new AIError(400, "INVALID_JSON", "The request must contain valid JSON."); }
  } finally { reader.releaseLock(); }
}
