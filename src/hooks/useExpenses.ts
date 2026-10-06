"use client";

import { useCallback, useEffect, useState } from "react";
import { Expense, ExpenseInput } from "@/types/expense";
import { generateId, loadExpenses, saveExpenses, STORAGE_KEY } from "@/lib/storage";

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Read from localStorage after mount so server and client markup match.
  useEffect(() => {
    setExpenses(loadExpenses());
    setLoaded(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setExpenses(loadExpenses());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (loaded) saveExpenses(expenses);
  }, [expenses, loaded]);

  const addExpense = useCallback((input: ExpenseInput) => {
    const expense: Expense = { ...input, id: generateId(), createdAt: Date.now() };
    setExpenses((prev) => [expense, ...prev]);
  }, []);

  const updateExpense = useCallback((id: string, input: ExpenseInput) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...input } : e)));
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { expenses, loaded, addExpense, updateExpense, deleteExpense };
}
