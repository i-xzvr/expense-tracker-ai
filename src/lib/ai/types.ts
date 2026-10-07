import type { Category } from "../../types/expense";

export interface AIStatus {
  reachable: boolean;
  modelReady: boolean;
  model: string;
  version?: string;
  localOnly: true;
  error?: string;
}

export interface EvidenceRow {
  id: string;
  date: string;
  description: string;
  merchant: string;
  category: Category;
  amountCents: number;
}

export interface CategoryEvidence { category: Category; count: number; totalCents: number }
export interface MerchantEvidence { merchant: string; count: number; totalCents: number; expenseIds: string[] }

export interface QueryResponse {
  answer: string;
  expenseIds: string[];
  model: string;
  evidence: {
    intent: "total" | "list" | "compare" | "categories" | "merchant" | "recurring";
    period: { from: string; to: string };
    filters: { category: Category | null; merchant: string | null; search: string | null };
    count: number;
    totalCents: number;
    categories: CategoryEvidence[];
    merchants: MerchantEvidence[];
    recurring: MerchantEvidence[];
    comparison?: {
      from: string;
      to: string;
      count: number;
      totalCents: number;
      differenceCents: number;
      categories: (CategoryEvidence & { differenceCents: number })[];
    };
    matches: EvidenceRow[];
  };
}

export interface ReceiptExtraction {
  date: string | null;
  amount: number | null;
  merchant: string | null;
  description: string | null;
  category: Category | null;
}

export interface ReceiptResponse {
  model: string;
  extracted: ReceiptExtraction;
  warnings: string[];
}

export interface AIErrorResponse { error: string; code: string }
