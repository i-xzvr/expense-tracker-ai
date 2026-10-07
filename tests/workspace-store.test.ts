import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceStore, type WorkspaceInput, type WorkspaceStorePlatform } from "../src/lib/workspace-store";
import { emptyWorkspace, exportWorkspaceBackup } from "../src/lib/accounting";
import type { Workspace } from "../src/types/accounting";

const input: WorkspaceInput = { date: "2026-10-01", amount: 12.34, category: "Food", description: "Lunch", account: "Checking" };
function harness(workspace: Workspace | null = null, legacy: string | null = null) {
  let raw = workspace ? JSON.stringify(workspace) : null;
  let writesFail = false; let readsFail = false; let legacyReads = 0;
  let conflict: string | null = null;
  const listeners = new Set<() => void>();
  const platform: WorkspaceStorePlatform = {
    async read() { if (readsFail) throw new Error("Read failed"); return raw; },
    async write(next, expected) { if (writesFail) throw new Error("Storage full"); if (conflict) { raw = conflict; conflict = null; } if (raw !== expected) throw new Error("Another tab changed this workspace"); raw = next; },
    readLegacy() { legacyReads++; return legacy; },
    subscribeChanges(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return {
    platform, state: () => ({ raw, legacy, legacyReads }),
    failWrites(value: boolean) { writesFail = value; }, failReads(value: boolean) { readsFail = value; },
    setExternal(workspace: Workspace) { raw = JSON.stringify(workspace); for (const listener of listeners) listener(); },
    conflictOnWrite(workspace: Workspace) { conflict = JSON.stringify(workspace); },
  };
}

test("V2 migration is copied once into separate V3 storage without modifying legacy", async () => {
  const legacy = JSON.stringify([{ ...input, id: "legacy", createdAt: 100 }]);
  const h = harness(null, legacy); const store = createWorkspaceStore(h.platform);
  assert.equal(store.getSnapshot().loaded, false); assert.equal(store.getServerSnapshot().loaded, false);
  await store.ready(); assert.equal(store.getSnapshot().workspace.expenses[0].id, "legacy");
  assert.equal(h.state().legacy, legacy); assert.equal(h.state().legacyReads, 1);
  assert.equal(store.getSnapshot().workspace.audit[0].action, "migration");
  await store.addExpense(input); assert.equal(h.state().legacyReads, 1);
  const second = createWorkspaceStore(h.platform); await second.ready(); assert.equal(second.getSnapshot().workspace.expenses.length, 2);
  assert.equal(h.state().legacyReads, 1);
});

test("invalid legacy migration fails without silently dropping or overwriting data", async () => {
  const h = harness(null, '[{"bad":"expense"}]'); const store = createWorkspaceStore(h.platform);
  await store.ready(); assert.match(store.getSnapshot().error ?? "", /ID/); assert.equal(h.state().raw, null);
  const result = await store.addExpense(input); assert.equal(result.ok, false); assert.equal(h.state().raw, null);
});

test("save failure keeps durable data, exposes error, and retries cleanly", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const before = store.getSnapshot().workspace; h.failWrites(true);
  assert.equal((await store.addExpense(input)).ok, false);
  assert.equal(store.getSnapshot().workspace, before); assert.match(store.getSnapshot().error ?? "", /Storage full/);
  h.failWrites(false); assert.equal((await store.addExpense(input)).ok, true);
  assert.equal(store.getSnapshot().workspace.expenses.length, 1); assert.equal(store.getSnapshot().error, null);
});

test("read failure never publishes an edit based on an empty or stale workspace", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  await store.addExpense(input); const before = h.state().raw; h.failReads(true);
  assert.equal((await store.addExpense({ ...input, description: "New" })).ok, false);
  assert.equal(h.state().raw, before); assert.equal(store.getSnapshot().workspace.expenses.length, 1);
});

test("serialized mutations and external refresh avoid lost updates, atomic conflicts are visible", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const results = await Promise.all([store.addExpense(input), store.addExpense({ ...input, description: "Second" })]);
  assert.ok(results.every((r) => r.ok)); assert.equal(store.getSnapshot().workspace.expenses.length, 2);
  const external = structuredClone(store.getSnapshot().workspace); external.expenses.push({ ...input, id: "external", createdAt: 1 });
  h.conflictOnWrite(external);
  const result = await store.addExpense({ ...input, description: "Conflicting" });
  assert.equal(result.ok, false); assert.match(result.error ?? "", /Another tab/);
  assert.equal(JSON.parse(h.state().raw!).expenses.length, 3);
  assert.equal((await store.addExpense({ ...input, description: "After refresh" })).ok, true);
  assert.equal(store.getSnapshot().workspace.expenses.length, 4);
});

test("undo restores data, retains prior audit, and cannot undo twice", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const add = await store.addExpense(input); assert.equal(add.ok, true); assert.equal(store.getSnapshot().canUndo, true);
  assert.equal((await store.undo()).ok, true); assert.equal(store.getSnapshot().workspace.expenses.length, 0);
  assert.deepEqual(store.getSnapshot().workspace.audit.map((a) => a.action), ["expense.add", "workspace.undo"]);
  assert.equal(store.getSnapshot().canUndo, false); assert.equal((await store.undo()).ok, false);
});

test("closed months protect expense, source, budget and backup changes until explicit reopening", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const added = await store.addExpense(input); const id = added.id!;
  assert.equal((await store.closeMonth("2026-10")).ok, false);
  await store.updateExpense(id, { reviewed: true }); const older = exportWorkspaceBackup(store.getSnapshot().workspace);
  assert.equal((await store.closeMonth("2026-10")).ok, true);
  assert.equal((await store.addExpense(input)).ok, false); assert.equal((await store.updateExpense(id, { description: "Changed" })).ok, false);
  assert.equal((await store.deleteExpense(id)).ok, false); assert.equal((await store.attachReceipt(id, null)).ok, false);
  assert.equal((await store.setBudget("2026-10", "Food", 10000)).ok, false);
  assert.equal((await store.importBackup(older)).ok, false);
  assert.equal((await store.addStatement({ account: "Checking", startDate: "2026-10-01", endDate: "2026-10-31", openingCents: 10000, closingCents: 8766, lines: [{ date: input.date, description: "Cafe", amountCents: -1234 }] })).ok, false);
  assert.equal((await store.reopenMonth("2026-10")).ok, true); assert.equal((await store.updateExpense(id, { description: "Changed" })).ok, true);
});

test("statement imports prevent duplicates, require exact matches, and prevent deleting matched expenses", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const added = await store.addExpense({ ...input, reviewed: true }); const id = added.id!;
  const data = { account: "Checking", startDate: "2026-10-01", endDate: "2026-10-31", openingCents: 10000, closingCents: 8766, lines: [{ date: input.date, description: "Cafe", amountCents: -1234 }] };
  const imported = await store.addStatement(data); assert.equal(imported.ok, true); assert.equal((await store.addStatement(data)).ok, false);
  const lineId = store.getSnapshot().workspace.statements[0].lines[0].id;
  assert.equal((await store.closeMonth("2026-10")).ok, false);
  assert.equal((await store.matchStatementLine(imported.id!, lineId, id)).ok, true);
  assert.equal((await store.updateExpense(id, { amount: 12.35 })).ok, false);
  assert.equal((await store.deleteExpense(id)).ok, false);
  assert.equal((await store.closeMonth("2026-10")).ok, true);
  assert.equal((await store.matchStatementLine(imported.id!, lineId, null)).ok, false);
  assert.equal((await store.classifyStatementLine(imported.id!, lineId, "other")).ok, false);
  await store.reopenMonth("2026-10"); await store.matchStatementLine(imported.id!, lineId, null);
  assert.equal((await store.deleteExpense(id)).ok, true);
});

test("receipt discrepancies block closing and attachments require real unique receipt references", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const added = await store.addExpense({ ...input, reviewed: true });
  assert.equal((await store.attachReceipt(added.id!, "missing")).ok, false);
  const receipt = await store.addReceipt({ filename: "receipt.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=", extracted: { amount: 11 }, });
  assert.equal(receipt.ok, true); assert.equal((await store.attachReceipt(added.id!, receipt.id!)).ok, true);
  assert.equal((await store.closeMonth("2026-10")).ok, false); assert.equal((await store.removeReceipt(receipt.id!)).ok, false);
  await store.attachReceipt(added.id!, null); assert.equal((await store.removeReceipt(receipt.id!)).ok, true);
  assert.equal((await store.closeMonth("2026-10")).ok, true);
});

test("backup import is all-or-nothing, includes evidence, preserves existing audit and supports undo", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  await store.addExpense(input); const before = h.state().raw;
  assert.equal((await store.importBackup('{"schemaVersion":3}')).ok, false); assert.equal(h.state().raw, before);
  const replacement = { ...emptyWorkspace(), expenses: [{ ...input, id: "replacement", createdAt: 1 }] };
  assert.equal((await store.importBackup(exportWorkspaceBackup(replacement))).ok, true);
  assert.equal(store.getSnapshot().workspace.expenses[0].id, "replacement");
  assert.deepEqual(store.getSnapshot().workspace.audit.map((a) => a.action), ["expense.add", "workspace.restore"]);
  assert.equal((await store.undo()).ok, true); assert.notEqual(store.getSnapshot().workspace.expenses[0].id, "replacement");
});

test("receipt corrections resolve date differences and cannot change evidence for a closed month", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const added = await store.addExpense({ ...input, reviewed: true });
  const receipt = await store.addReceipt({ filename: "receipt.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=", extracted: { date: "2026-10-02", amount: 12.34 } });
  await store.attachReceipt(added.id!, receipt.id!);
  assert.equal((await store.closeMonth("2026-10")).ok, false);
  assert.equal((await store.updateReceipt(receipt.id!, { extracted: { date: "2026-10-01", amount: 12.34 } })).ok, true);
  assert.equal((await store.closeMonth("2026-10")).ok, true);
  assert.equal((await store.updateReceipt(receipt.id!, { extracted: { date: "2026-10-02" } })).ok, false);
  assert.equal(store.getSnapshot().workspace.receipts[0].extracted?.date, "2026-10-01");
});

test("merchant rules are editable suggestions and never silently recategorize existing expenses", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  await store.addExpense({ ...input, merchant: "Cafe" });
  await store.addRule(" cafe ", "Bills"); assert.equal(store.suggestedCategory("Cafe"), "Bills");
  assert.equal(store.getSnapshot().workspace.expenses[0].category, "Food");
  await store.addRule("CAFE", "Other"); assert.equal(store.getSnapshot().workspace.rules.length, 1);
  assert.equal(store.suggestedCategory(" cafe"), "Other");
});

test("V2 JSON merge validates rows, ignores summary claims, skips identical IDs and keeps V3 metadata", async () => {
  const legacy = { id: "v2-a", date: "2026-10-01", amount: 12.34, category: "Food" as const, description: "Lunch", createdAt: 100 };
  const h = harness({ ...emptyWorkspace(), expenses: [{ ...legacy, merchant: "Cafe", project: "Project", reviewed: true }] });
  const store = createWorkspaceStore(h.platform); await store.ready();
  const raw = JSON.stringify({ schemaVersion: 1, currency: "USD", expenses: [legacy, { ...legacy, id: "v2-b" }], summary: { totalCents: 99999999 } });
  assert.equal((await store.importV2Report(raw)).ok, true);
  assert.equal(store.getSnapshot().workspace.expenses.length, 2);
  assert.equal(store.getSnapshot().workspace.expenses[0].merchant, "Cafe");
  assert.match(store.getSnapshot().workspace.audit.at(-1)!.detail, /added 1, skipped 1/);
  assert.equal((await store.importV2Report(raw)).ok, true);
  assert.equal(store.getSnapshot().workspace.expenses.length, 2);
  assert.match(store.getSnapshot().workspace.audit.at(-1)!.detail, /added 0, skipped 2/);
});

test("V2 merge rejects conflicting IDs, invalid batches and additions to closed months atomically", async () => {
  const legacy = { id: "v2-a", date: "2026-10-01", amount: 12.34, category: "Food" as const, description: "Lunch", createdAt: 100 };
  const h = harness({ ...emptyWorkspace(), expenses: [{ ...legacy, reviewed: true }] });
  const store = createWorkspaceStore(h.platform); await store.ready();
  const wrap = (expenses: unknown) => JSON.stringify({ schemaVersion: 1, currency: "USD", expenses });
  const before = h.state().raw;
  assert.equal((await store.importV2Report(wrap([{ ...legacy, id: "new" }, { ...legacy, amount: 99 }]))).ok, false);
  assert.equal(h.state().raw, before);
  assert.equal((await store.importV2Report(wrap([{ ...legacy, id: "new" }, { ...legacy, id: "invalid", amount: -1 }]))).ok, false);
  assert.equal(h.state().raw, before);
  assert.equal((await store.importV2Report(exportWorkspaceBackup(emptyWorkspace()))).ok, false);
  await store.closeMonth("2026-10");
  assert.equal((await store.importV2Report(wrap([legacy]))).ok, true);
  assert.equal((await store.importV2Report(wrap([{ ...legacy, id: "new" }]))).ok, false);
  assert.equal(store.getSnapshot().workspace.expenses.length, 1);
});

test("external notifications replace the snapshot, clear stale undo, and unsubscribe cleanly", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  let notifications = 0; const unsubscribe = store.subscribe(() => { notifications++; });
  await store.addExpense(input); assert.equal(store.getSnapshot().canUndo, true);
  const external = { ...emptyWorkspace(), expenses: [{ ...input, id: "other-tab", createdAt: 100 }] };
  h.setExternal(external);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.getSnapshot().workspace.expenses[0].id, "other-tab");
  assert.equal(store.getSnapshot().canUndo, false); assert.ok(notifications >= 2);
  unsubscribe();
  h.setExternal(emptyWorkspace()); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.getSnapshot().workspace.expenses[0].id, "other-tab");
});

test("removing an open statement preserves expenses, while closed statements cannot be removed", async () => {
  const h = harness(emptyWorkspace()); const store = createWorkspaceStore(h.platform); await store.ready();
  const added = await store.addExpense({ ...input, reviewed: true });
  const imported = await store.addStatement({ account: "Checking", startDate: "2026-10-01", endDate: "2026-10-31", openingCents: 10000, closingCents: 8766, lines: [{ date: input.date, description: "Cafe", amountCents: -1234 }] });
  await store.matchStatementLine(imported.id!, store.getSnapshot().workspace.statements[0].lines[0].id, added.id!);
  await store.closeMonth("2026-10"); assert.equal((await store.removeStatement(imported.id!)).ok, false);
  await store.reopenMonth("2026-10"); assert.equal((await store.removeStatement(imported.id!)).ok, true);
  assert.equal(store.getSnapshot().workspace.statements.length, 0); assert.equal(store.getSnapshot().workspace.expenses.length, 1);
});
