import type { Expense, ExpenseInput } from "../types/expense";
import { generateId, parseStoredExpenses, STORAGE_KEY } from "./storage";

interface ExpenseSnapshot {
  expenses: Expense[];
  loaded: boolean;
}

type ExpenseStorage = Pick<Storage, "getItem" | "setItem">;

interface StorageChange {
  key: string | null;
  storageArea: ExpenseStorage | null;
}

export interface ExpenseStorePlatform {
  // Accessing localStorage itself can throw in restricted browser contexts.
  getStorage: () => ExpenseStorage;
  subscribeStorage: (listener: (event: StorageChange) => void) => () => void;
}

const SERVER_SNAPSHOT: ExpenseSnapshot = { expenses: [], loaded: false };

/** A cached browser store shared by every useExpenses subscriber in this tab. */
export function createExpenseStore(platform?: ExpenseStorePlatform) {
  let snapshot = SERVER_SNAPSHOT;
  let lastStoredValue: string | null | undefined;
  let hasUnsavedChanges = false;
  let unsubscribeStorage: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const refresh = () => {
    if (!platform || hasUnsavedChanges) return;
    try {
      const raw = platform.getStorage().getItem(STORAGE_KEY);
      if (snapshot.loaded && raw === lastStoredValue) return;
      lastStoredValue = raw;
      snapshot = { expenses: parseStoredExpenses(raw), loaded: true };
    } catch {
      // A failed read must not erase expenses already held in memory.
      if (!snapshot.loaded) snapshot = { expenses: [], loaded: true };
    }
  };

  const getSnapshot = () => {
    if (!snapshot.loaded) refresh();
    return snapshot;
  };

  const onStorage = (event: StorageChange) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    if (event.storageArea !== null) {
      try {
        if (event.storageArea !== platform?.getStorage()) return;
      } catch {
        return;
      }
    }
    const previous = snapshot;
    refresh();
    if (snapshot !== previous) notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (platform && listeners.size === 1) {
      unsubscribeStorage = platform.subscribeStorage(onStorage);
      // Recheck after subscribing to catch changes between render and commit,
      // including changes made while no component was subscribed.
      const previous = snapshot;
      refresh();
      if (snapshot !== previous) notify();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        unsubscribeStorage?.();
        unsubscribeStorage = undefined;
      }
    };
  };

  const changeExpenses = (update: (expenses: Expense[]) => Expense[]) => {
    if (!platform) return;
    const previous = snapshot;
    // Read the latest persisted data before editing, even if another tab's
    // storage event has not arrived. Unsaved local edits take precedence.
    refresh();
    const expenses = update(snapshot.expenses);
    if (expenses !== snapshot.expenses) {
      snapshot = { expenses, loaded: true };
      try {
        const raw = JSON.stringify(expenses);
        platform.getStorage().setItem(STORAGE_KEY, raw);
        lastStoredValue = raw;
        hasUnsavedChanges = false;
      } catch {
        // Keep this tab usable if storage is full or disabled. A later edit
        // retries saving the complete in-memory state, without discarding it.
        hasUnsavedChanges = true;
      }
    }
    if (snapshot !== previous) notify();
  };

  return {
    getSnapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe,
    addExpense(input: ExpenseInput) {
      changeExpenses((expenses) => [
        { ...input, id: generateId(), createdAt: Date.now() },
        ...expenses,
      ]);
    },
    updateExpense(id: string, input: ExpenseInput) {
      changeExpenses((expenses) =>
        expenses.some((expense) => expense.id === id)
          ? expenses.map((expense) =>
              expense.id === id ? { ...expense, ...input } : expense,
            )
          : expenses,
      );
    },
    deleteExpense(id: string) {
      changeExpenses((expenses) =>
        expenses.some((expense) => expense.id === id)
          ? expenses.filter((expense) => expense.id !== id)
          : expenses,
      );
    },
  };
}

export const expenseStore = createExpenseStore(
  typeof window === "undefined"
    ? undefined
    : {
        getStorage: () => window.localStorage,
        subscribeStorage(listener) {
          window.addEventListener("storage", listener);
          return () => window.removeEventListener("storage", listener);
        },
      },
);
