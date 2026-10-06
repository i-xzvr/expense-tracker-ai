"use client";

import { FormEvent, useState } from "react";
import { CATEGORIES, Category, Expense, ExpenseInput } from "@/types/expense";
import {
  ExpenseFormValues,
  MAX_DESCRIPTION,
  ValidationErrors,
  validateExpense,
} from "@/lib/expenses";
import { todayISO } from "@/lib/format";

interface ExpenseFormProps {
  initial?: Expense;
  onSubmit: (data: ExpenseInput) => void;
  onCancel: () => void;
}

function toFormValues(expense?: Expense): ExpenseFormValues {
  if (!expense) return { date: todayISO(), amount: "", category: "", description: "" };
  return {
    date: expense.date,
    amount: expense.amount.toFixed(2),
    category: expense.category,
    description: expense.description,
  };
}

export default function ExpenseForm({ initial, onSubmit, onCancel }: ExpenseFormProps) {
  const [values, setValues] = useState<ExpenseFormValues>(() => toFormValues(initial));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const update = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    // Re-validate live once the user has tried to submit.
    if (submitted) setErrors(validateExpense(next).errors);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const result = validateExpense(values);
    setErrors(result.errors);
    if (result.data) onSubmit(result.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date" label="Date" error={errors.date}>
          <input
            id="date"
            type="date"
            max={todayISO()}
            value={values.date}
            onChange={(e) => update("date", e.target.value)}
            className={`input ${errors.date ? "input-error" : ""}`}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? "date-error" : undefined}
          />
        </Field>

        <Field id="amount" label="Amount (USD)" error={errors.amount}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
              $
            </span>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus={!initial}
              value={values.amount}
              onChange={(e) => update("amount", e.target.value)}
              className={`input pl-7 ${errors.amount ? "input-error" : ""}`}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? "amount-error" : undefined}
            />
          </div>
        </Field>
      </div>

      <Field id="category" label="Category" error={errors.category}>
        <select
          id="category"
          value={values.category}
          onChange={(e) => update("category", e.target.value as Category | "")}
          className={`input ${errors.category ? "input-error" : ""}`}
          aria-invalid={!!errors.category}
          aria-describedby={errors.category ? "category-error" : undefined}
        >
          <option value="">Select a category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field id="description" label="Description" error={errors.description}>
        <input
          id="description"
          type="text"
          placeholder="e.g. Groceries at Whole Foods"
          maxLength={MAX_DESCRIPTION + 20}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          className={`input ${errors.description ? "input-error" : ""}`}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "description-error" : undefined}
        />
        <p className="mt-1 text-right text-xs text-slate-400">
          {values.description.trim().length}/{MAX_DESCRIPTION}
        </p>
      </Field>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {initial ? "Save changes" : "Add expense"}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
