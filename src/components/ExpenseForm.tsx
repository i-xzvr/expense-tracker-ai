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
import type { AccountingExpense, CategoryRule } from "@/types/accounting";

interface ExpenseFormProps {
  initial?: AccountingExpense;
  defaults?: Partial<AccountingExpense>;
  rules?: CategoryRule[];
  onRememberRule?: (merchant: string, category: Category) => void;
  onSubmit: (data: ExpenseInput & Partial<AccountingExpense>) => void;
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

export default function ExpenseForm({ initial, defaults, rules = [], onRememberRule, onSubmit, onCancel }: ExpenseFormProps) {
  const [values, setValues] = useState<ExpenseFormValues>(() => ({ ...toFormValues(initial), ...(defaults ? { date: defaults.date ?? "", amount: defaults.amount?.toFixed(2) ?? "", category: defaults.category ?? "", description: defaults.description ?? "" } : {}) }));
  const [merchant, setMerchant] = useState(initial?.merchant ?? defaults?.merchant ?? "");
  const [project, setProject] = useState(initial?.project ?? defaults?.project ?? "");
  const [account, setAccount] = useState(initial?.account ?? defaults?.account ?? "");
  const [reimbursement, setReimbursement] = useState<AccountingExpense["reimbursement"]>(initial?.reimbursement ?? defaults?.reimbursement ?? "none");
  const [reviewed, setReviewed] = useState(initial?.reviewed ?? false);
  const rule = rules.find(item => item.merchant.trim().toLowerCase() === merchant.trim().toLowerCase());
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
    if (result.data) onSubmit({ ...result.data, merchant: merchant.trim(), project: project.trim(), account: account.trim(), reimbursement, reviewed });
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
              data-initial-focus={!initial ? "" : undefined}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="merchant" label="Merchant"><input id="merchant" className="input" maxLength={100} value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="e.g. Acme Supplies" /></Field>
        <Field id="account" label="Payment account"><input id="account" className="input" maxLength={100} value={account} onChange={e => setAccount(e.target.value)} placeholder="e.g. Business checking" /></Field>
        <Field id="project" label="Project or client"><input id="project" className="input" maxLength={100} value={project} onChange={e => setProject(e.target.value)} placeholder="Optional" /></Field>
        <Field id="reimbursement" label="Reimbursement"><select id="reimbursement" className="input" value={reimbursement} onChange={e => setReimbursement(e.target.value as AccountingExpense["reimbursement"])}><option value="none">Not reimbursable</option><option value="pending">Awaiting reimbursement</option><option value="paid">Reimbursed</option></select></Field>
      </div>
      {rule && rule.category !== values.category && <button className="btn-secondary" type="button" onClick={() => update("category", rule.category)}>Use saved rule: {rule.category}</button>}
      {onRememberRule && merchant.trim() && values.category && <button className="text-sm font-medium text-indigo-700 underline" type="button" onClick={() => onRememberRule(merchant.trim(), values.category as Category)}>Remember this merchant’s category</button>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> I have reviewed this expense</label>

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
