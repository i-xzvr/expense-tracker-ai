import assert from "node:assert/strict";
import test from "node:test";
import {
  createExpenseStore,
  type ExpenseStorePlatform,
} from "../src/lib/expense-store";
import { STORAGE_KEY } from "../src/lib/storage";
import type { Expense, ExpenseInput } from "../src/types/expense";

const input: ExpenseInput = {
  date: "2026-10-01",
  amount: 12.5,
  category: "Food",
  description: "Lunch",
};

function expense(overrides: Partial<Expense> = {}): Expense {
  return { ...input, id: "existing", createdAt: 100, ...overrides };
}

function storageHarness(initial: string | null = null) {
  type Listener = Parameters<ExpenseStorePlatform["subscribeStorage"]>[0];
  const listeners = new Set<Listener>();
  let value = initial;
  let reads = 0;
  let writes = 0;
  let unavailable = false;
  let readsFail = false;
  let writesFail = false;
  const storage = {
    getItem(key: string) {
      assert.equal(key, STORAGE_KEY);
      reads++;
      if (readsFail) throw new Error("Storage read failed");
      return value;
    },
    setItem(key: string, next: string) {
      assert.equal(key, STORAGE_KEY);
      writes++;
      if (writesFail) throw new Error("Storage quota exceeded");
      value = next;
    },
  };
  const platform: ExpenseStorePlatform = {
    getStorage() {
      if (unavailable) throw new Error("Storage access denied");
      return storage;
    },
    subscribeStorage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    platform,
    storage,
    state: () => ({ value, reads, writes, subscriptions: listeners.size }),
    setUnavailable(next: boolean) {
      unavailable = next;
    },
    setReadsFail(next: boolean) {
      readsFail = next;
    },
    setWritesFail(next: boolean) {
      writesFail = next;
    },
    setExternalValue(next: string | null) {
      value = next;
    },
    emit(key: string | null = STORAGE_KEY, storageArea = storage) {
      for (const listener of listeners) listener({ key, storageArea });
    },
  };
}

test("server and hydration snapshots stay empty without accessing storage", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  const server = store.getServerSnapshot();
  assert.deepEqual(server, { expenses: [], loaded: false });
  assert.equal(server, store.getServerSnapshot());
  assert.equal(harness.state().reads, 0);
  assert.equal(harness.state().writes, 0);
  assert.deepEqual(createExpenseStore().getSnapshot(), server);

  assert.equal(store.getSnapshot().expenses.length, 1);
  assert.equal(store.getServerSnapshot(), server);
  assert.deepEqual(server, { expenses: [], loaded: false });
});

test("loading and subscribing preserve saved expenses without an initial overwrite", () => {
  const raw = JSON.stringify([expense()]);
  const harness = storageHarness(raw);
  const store = createExpenseStore(harness.platform);
  assert.deepEqual(store.getSnapshot(), { expenses: [expense()], loaded: true });
  const unsubscribe = store.subscribe(() => {});
  unsubscribe();
  const resubscribe = store.subscribe(() => {});
  resubscribe();
  assert.equal(harness.state().value, raw);
  assert.equal(harness.state().writes, 0);
  assert.equal(harness.state().subscriptions, 0);
});

test("snapshot objects are cached and unchanged storage events do not notify", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  const initial = store.getSnapshot();
  const initialReads = harness.state().reads;
  for (let index = 0; index < 10; index++) {
    assert.equal(store.getSnapshot(), initial);
  }
  assert.equal(harness.state().reads, initialReads);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  harness.emit();
  assert.equal(store.getSnapshot(), initial);
  assert.equal(notifications, 0);
  unsubscribe();
});

test("add, edit and delete notify every same-tab subscriber and preserve expense identity", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  store.getSnapshot();
  let firstNotifications = 0;
  let secondNotifications = 0;
  const first = store.subscribe(() => firstNotifications++);
  const second = store.subscribe(() => secondNotifications++);
  assert.equal(harness.state().subscriptions, 1);

  store.addExpense({ ...input, description: "New expense" });
  const added = store.getSnapshot().expenses[0];
  assert.equal(added.description, "New expense");
  assert.equal(typeof added.id, "string");
  assert.ok(added.id.length > 0);
  assert.ok(Number.isFinite(added.createdAt));
  assert.equal(store.getSnapshot().expenses[1].id, "existing");

  store.updateExpense(added.id, { ...input, amount: 29, description: "Updated" });
  const updated = store.getSnapshot().expenses[0];
  assert.deepEqual(updated, {
    ...input,
    amount: 29,
    description: "Updated",
    id: added.id,
    createdAt: added.createdAt,
  });
  store.deleteExpense("existing");
  assert.deepEqual(store.getSnapshot().expenses, [updated]);
  assert.deepEqual(JSON.parse(harness.state().value!), [updated]);
  assert.equal(firstNotifications, 3);
  assert.equal(secondNotifications, 3);
  first();
  assert.equal(harness.state().subscriptions, 1);
  second();
  assert.equal(harness.state().subscriptions, 0);
});

test("other-tab changes, item removal and localStorage.clear synchronize without writing back", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  store.getSnapshot();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  const remote = expense({ id: "remote", amount: 50 });
  harness.setExternalValue(JSON.stringify([remote]));
  harness.emit();
  assert.deepEqual(store.getSnapshot().expenses, [remote]);

  harness.setExternalValue(null);
  harness.emit();
  assert.deepEqual(store.getSnapshot().expenses, []);
  harness.setExternalValue(JSON.stringify([remote]));
  harness.emit();
  harness.setExternalValue(null);
  harness.emit(null);
  assert.deepEqual(store.getSnapshot().expenses, []);
  assert.equal(notifications, 4);
  assert.equal(harness.state().writes, 0);
  unsubscribe();
});

test("unrelated keys and sessionStorage events cannot change the expense snapshot", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  const initial = store.getSnapshot();
  const unsubscribe = store.subscribe(() => {});
  harness.setExternalValue(null);
  harness.emit("another-key");
  harness.emit(STORAGE_KEY, { getItem: () => null, setItem: () => {} });
  harness.emit(null, { getItem: () => null, setItem: () => {} });
  assert.equal(store.getSnapshot(), initial);
  unsubscribe();
});

test("subscription rechecks changes missed between render and commit or while unmounted", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  store.getSnapshot();
  const remote = expense({ id: "between-render-and-commit" });
  harness.setExternalValue(JSON.stringify([remote]));
  const unsubscribe = store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot().expenses, [remote]);
  unsubscribe();
  harness.setExternalValue(null);
  const resubscribe = store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot().expenses, []);
  assert.equal(harness.state().writes, 0);
  resubscribe();
});

test("edits include a newer persisted expense even before the storage event arrives", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  store.getSnapshot();
  const remote = expense({ id: "remote" });
  harness.setExternalValue(JSON.stringify([expense(), remote]));
  store.addExpense({ ...input, description: "Local addition" });
  assert.deepEqual(store.getSnapshot().expenses.slice(1), [expense(), remote]);
  assert.equal(JSON.parse(harness.state().value!).length, 3);
});

test("unavailable storage keeps add/edit/delete usable in memory and can recover", () => {
  const harness = storageHarness();
  harness.setUnavailable(true);
  const store = createExpenseStore(harness.platform);
  assert.deepEqual(store.getSnapshot(), { expenses: [], loaded: true });
  const unsubscribe = store.subscribe(() => {});
  store.addExpense(input);
  const first = store.getSnapshot().expenses[0];
  store.updateExpense(first.id, { ...input, amount: 20 });
  store.addExpense({ ...input, description: "Second" });
  const second = store.getSnapshot().expenses[0];
  store.deleteExpense(second.id);
  assert.deepEqual(store.getSnapshot().expenses, [{ ...first, amount: 20 }]);

  harness.setUnavailable(false);
  store.updateExpense(first.id, { ...input, amount: 21 });
  assert.deepEqual(JSON.parse(harness.state().value!), [{ ...first, amount: 21 }]);
  unsubscribe();
});

test("failed writes and stale storage events do not discard unsaved local changes", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  store.getSnapshot();
  const unsubscribe = store.subscribe(() => {});
  harness.setWritesFail(true);
  store.addExpense({ ...input, description: "Unsaved" });
  const unsaved = store.getSnapshot();
  harness.emit();
  assert.equal(store.getSnapshot(), unsaved);
  unsubscribe();
  const resubscribe = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), unsaved);

  harness.setWritesFail(false);
  store.updateExpense("existing", { ...input, amount: 99 });
  const saved = JSON.parse(harness.state().value!) as Expense[];
  assert.equal(saved.length, 2);
  assert.equal(saved[0].description, "Unsaved");
  assert.equal(saved[1].amount, 99);
  resubscribe();
});

test("a later storage read failure preserves the existing cached expenses", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  const initial = store.getSnapshot();
  const unsubscribe = store.subscribe(() => {});
  harness.setReadsFail(true);
  harness.emit();
  assert.equal(store.getSnapshot(), initial);
  store.addExpense(input);
  assert.equal(store.getSnapshot().expenses.length, 2);
  assert.equal(JSON.parse(harness.state().value!).length, 2);
  unsubscribe();
});

test("stored malformed data is filtered by the existing schema without rewriting it", () => {
  const valid = expense();
  const raw = JSON.stringify([
    valid,
    { ...valid, date: "2026-02-30" },
    { ...valid, category: "Unknown" },
    { ...valid, amount: "12.50" },
    null,
  ]);
  const harness = storageHarness(raw);
  assert.deepEqual(createExpenseStore(harness.platform).getSnapshot().expenses, [valid]);
  assert.equal(harness.state().value, raw);
  assert.equal(harness.state().writes, 0);
  for (const invalid of ["{broken", "{}", "null"]) {
    const invalidHarness = storageHarness(invalid);
    assert.deepEqual(
      createExpenseStore(invalidHarness.platform).getSnapshot().expenses,
      [],
    );
    assert.equal(invalidHarness.state().value, invalid);
    assert.equal(invalidHarness.state().writes, 0);
  }
});

test("editing or deleting a missing expense does not write or replace a stable snapshot", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  const initial = store.getSnapshot();
  store.updateExpense("missing", input);
  store.deleteExpense("missing");
  assert.equal(store.getSnapshot(), initial);
  assert.equal(harness.state().writes, 0);
});

test("prior snapshots and caller input remain independent across mutations", () => {
  const harness = storageHarness(JSON.stringify([expense()]));
  const store = createExpenseStore(harness.platform);
  const initial = store.getSnapshot();
  const callerInput = { ...input, description: "Original caller value" };
  store.addExpense(callerInput);
  const afterAdd = store.getSnapshot();
  const newId = afterAdd.expenses[0].id;
  callerInput.description = "Mutated outside the store";
  store.updateExpense("existing", { ...input, amount: 100 });
  const afterEdit = store.getSnapshot();
  store.deleteExpense(newId);

  assert.deepEqual(initial, { expenses: [expense()], loaded: true });
  assert.equal(afterAdd.expenses.length, 2);
  assert.equal(afterAdd.expenses[0].description, "Original caller value");
  assert.equal(afterAdd.expenses[1].amount, 12.5);
  assert.equal(afterEdit.expenses.length, 2);
  assert.equal(afterEdit.expenses[1].amount, 100);
  assert.equal(store.getSnapshot().expenses.length, 1);
});

test("unsubscribed listeners stay detached and cleanup is idempotent", () => {
  const harness = storageHarness();
  const store = createExpenseStore(harness.platform);
  store.getSnapshot();
  let firstNotifications = 0;
  let secondNotifications = 0;
  const first = store.subscribe(() => firstNotifications++);
  const second = store.subscribe(() => secondNotifications++);
  first();
  first();
  assert.equal(harness.state().subscriptions, 1);
  store.addExpense(input);
  assert.equal(firstNotifications, 0);
  assert.equal(secondNotifications, 1);
  second();
  second();
  assert.equal(harness.state().subscriptions, 0);
  harness.setExternalValue(null);
  harness.emit(null);
  assert.equal(secondNotifications, 1);
});
