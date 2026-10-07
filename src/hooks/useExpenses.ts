"use client";

import { useSyncExternalStore } from "react";
import { expenseStore } from "@/lib/expense-store";

export function useExpenses() {
  const snapshot = useSyncExternalStore(
    expenseStore.subscribe,
    expenseStore.getSnapshot,
    expenseStore.getServerSnapshot,
  );

  return {
    ...snapshot,
    addExpense: expenseStore.addExpense,
    updateExpense: expenseStore.updateExpense,
    deleteExpense: expenseStore.deleteExpense,
  };
}
