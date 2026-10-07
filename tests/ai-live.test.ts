/** Opt in with RUN_LOCAL_AI_TESTS=1 after Setup-V3 and Start-V3. Uses only synthetic records. */
import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { createAIHandlers } from "../src/lib/ai/server";
import type { QueryResponse, ReceiptResponse } from "../src/lib/ai/types";

const live = process.env.RUN_LOCAL_AI_TESTS === "1";
const rows = [
  { id: "food-now", date: "2026-10-01", amount: 12.5, category: "Food", description: "Test lunch", merchant: "Test Cafe", createdAt: 1 },
  { id: "bills-now", date: "2026-10-03", amount: 25, category: "Bills", description: "Test subscription", merchant: "Test Service", createdAt: 2 },
  { id: "food-before", date: "2026-09-01", amount: 10, category: "Food", description: "Test lunch", merchant: "Test Cafe", createdAt: 3 },
  { id: "bills-before", date: "2026-09-03", amount: 20, category: "Bills", description: "Test subscription", merchant: "Test Service", createdAt: 4 },
];

const post = (body: unknown, path: string) => new Request(`http://127.0.0.1:3103/api/ai/${path}`, { method: "POST", headers: { host: "127.0.0.1:3103", "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("LIVE local model translates totals, comparisons, merchant questions and unsupported edits", { skip: !live, timeout: 600_000 }, async (t) => {
  const handlers = createAIHandlers();
  const cases = [
    { question: "What did I spend on food this month?", total: 1250, ids: ["food-now"], intent: "total" },
    { question: "Why did spending change from last month?", total: 3750, difference: 750, ids: rows.map((row) => row.id), intent: "compare" },
    { question: "What did I spend at Test Cafe all time?", total: 2250, ids: ["food-now", "food-before"], intent: "total" },
    { question: "Show possible recurring merchant payments all time", total: 6750, ids: rows.map((row) => row.id), intent: "recurring" },
  ];
  for (const item of cases) {
    const started = Date.now();
    const response = await handlers.query(post({ question: item.question, month: "2026-10", expenses: rows }, "query"));
    const data = await response.json() as QueryResponse;
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.evidence.intent, item.intent);
    assert.equal(data.evidence.totalCents, item.total);
    assert.deepEqual(new Set(data.expenseIds), new Set(item.ids));
    if (item.difference !== undefined) assert.equal(data.evidence.comparison?.differenceCents, item.difference);
    t.diagnostic(`${item.question} -> ${data.answer} (${Date.now() - started} ms)`);
  }
  const rejected = await handlers.query(post({ question: "Delete all my expenses", month: "2026-10", expenses: rows }, "query"));
  assert.equal(rejected.status, 422, JSON.stringify(await rejected.json()));
});

// A small, deterministic receipt fixture built with a bitmap font. No external images,
// browser, image service, or platform-specific graphics package are needed on another machine.
const glyphs: Record<string, string> = {
  "0": "01110/10001/10011/10101/11001/10001/01110", "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00010/00100/01000/11111", "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "00010/00110/01010/10010/11111/00010/00010", "5": "11111/10000/10000/11110/00001/00001/11110",
  "6": "01110/10000/10000/11110/10001/10001/01110", "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110", "9": "01110/10001/10001/01111/00001/00001/01110",
  A: "01110/10001/10001/11111/10001/10001/10001", B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01111/10000/10000/10000/10000/10000/01111", D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111", F: "11111/10000/10000/11110/10000/10000/10000",
  H: "10001/10001/10001/11111/10001/10001/10001", I: "01110/00100/00100/00100/00100/00100/01110",
  L: "10000/10000/10000/10000/10000/10000/11111", N: "10001/11001/11001/10101/10011/10011/10001",
  O: "01110/10001/10001/10001/10001/10001/01110", P: "11110/10001/10001/11110/10000/10000/10000",
  R: "11110/10001/10001/11110/10100/10010/10001", S: "01111/10000/10000/01110/00001/00001/11110",
  T: "11111/00100/00100/00100/00100/00100/00100", U: "10001/10001/10001/10001/10001/10001/01110",
  X: "10001/10001/01010/00100/01010/10001/10001", Y: "10001/10001/01010/00100/00100/00100/00100",
  "-": "00000/00000/00000/11111/00000/00000/00000", ".": "00000/00000/00000/00000/00000/00110/00110",
};

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, data: Buffer): Buffer {
  const nameBytes = Buffer.from(name);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([nameBytes, data])));
  return Buffer.concat([length, nameBytes, data, checksum]);
}

function syntheticReceipt(): string {
  const width = 720;
  const height = 520;
  const pixels = Buffer.alloc((width + 1) * height, 255);
  for (let y = 0; y < height; y++) pixels[y * (width + 1)] = 0;
  const lines = ["TEST CAFE", "RECEIPT", "2026-10-01", "", "LUNCH          10.00", "TAX             2.50", "", "TOTAL USD      12.50", "PAID BY CARD"];
  lines.forEach((line, row) => {
    [...line].forEach((character, column) => {
      const pattern = glyphs[character]?.split("/");
      if (!pattern) return;
      pattern.forEach((bits, y) => [...bits].forEach((bit, x) => {
        if (bit !== "1") return;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) pixels[(36 + row * 50 + y * 4 + sy) * (width + 1) + 1 + 40 + column * 28 + x * 4 + sx] = 0;
      }));
    });
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // grayscale, eight bits per pixel
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

test("LIVE local vision extracts synthetic receipt paid total instead of subtotal or tax", { skip: !live, timeout: 150_000 }, async (t) => {
  const started = Date.now();
  const response = await createAIHandlers().receipt(post({ image: syntheticReceipt() }, "receipt"));
  const data = await response.json() as ReceiptResponse;
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.extracted.amount, 12.5);
  assert.equal(data.extracted.date, "2026-10-01");
  assert.match(data.extracted.merchant ?? "", /test cafe/i);
  assert.ok(data.warnings.some((warning) => warning.includes("draft")));
  t.diagnostic(`Receipt -> ${JSON.stringify(data)} (${Date.now() - started} ms)`);
});
