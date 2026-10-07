import type { Category, Expense } from "./expense";

export interface AccountingExpense extends Expense {
  merchant?: string;
  project?: string;
  account?: string;
  reimbursement?: "none" | "pending" | "paid";
  reviewed?: boolean;
  receiptId?: string;
}

export interface Receipt {
  id: string;
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
  createdAt: number;
  extracted?: { date?: string; amount?: number; merchant?: string; description?: string; category?: Category };
}

export interface Budget { month: string; category: Category; amountCents: number }
export interface CategoryRule { id: string; merchant: string; category: Category }
export interface StatementLine {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  expenseId?: string;
  classification?: "income" | "transfer" | "other";
}
export interface BankStatement {
  id: string;
  account: string;
  startDate: string;
  endDate: string;
  openingCents: number;
  closingCents: number;
  lines: StatementLine[];
}
export interface AuditEntry { id: string; at: number; action: string; detail: string }
export interface Workspace {
  schemaVersion: 3;
  expenses: AccountingExpense[];
  receipts: Receipt[];
  budgets: Budget[];
  rules: CategoryRule[];
  statements: BankStatement[];
  audit: AuditEntry[];
  closedMonths: string[];
}
