"use client";

import type { AccountingExpense } from "@/types/accounting";
import type { QueryResponse } from "@/lib/ai/types";
import { Cell, DataTable, Empty, money, Panel } from "./shared";

/** Historical evidence stays visible as a dated snapshot, never a live balance. */
export default function FinancialEvidence({ answer, expenses, onEdit }: { answer: QueryResponse; expenses: AccountingExpense[]; onEdit: (expense: AccountingExpense) => void }) {
  return <Panel title="Answer with evidence" description={`${answer.evidence.period.from} through ${answer.evidence.period.to} · ${answer.model}`}>
      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold">How your question was interpreted</h3>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[150px_1fr]">
          <dt className="text-slate-500">Report period</dt><dd>{answer.evidence.period.from} through {answer.evidence.period.to} (inclusive)</dd>
          {answer.evidence.comparison && <><dt className="text-slate-500">Comparison period</dt><dd>{answer.evidence.comparison.from} through {answer.evidence.comparison.to} (inclusive)</dd></>}
          <dt className="text-slate-500">Category</dt><dd>{answer.evidence.filters.category || "All categories"}</dd>
          <dt className="text-slate-500">Merchant filter</dt><dd className="break-words">{answer.evidence.filters.merchant ? `Contains “${answer.evidence.filters.merchant}”` : "All merchants"}</dd>
          <dt className="text-slate-500">Description filter</dt><dd className="break-words">{answer.evidence.filters.search ? `Contains “${answer.evidence.filters.search}”` : "All descriptions"}</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Check that these dates and filters match your intent. Change the question and ask again if they do not. Filters apply to both periods in a comparison.</p>
      </div>
      <p className="mb-5 whitespace-pre-line text-base leading-relaxed text-slate-800">{answer.answer}</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-indigo-50 p-4"><p className="text-xs text-indigo-700">Report period entries</p><p className="text-xl font-semibold">{answer.evidence.count}</p></div><div className="rounded-lg bg-indigo-50 p-4"><p className="text-xs text-indigo-700">Report period total</p><p className="text-xl font-semibold">{money(answer.evidence.totalCents)}</p></div>{answer.evidence.comparison && <><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-600">Comparison period total · {answer.evidence.comparison.count} entries</p><p className="text-xl font-semibold">{money(answer.evidence.comparison.totalCents)}</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-600">Change in recorded spending</p><p className="text-xl font-semibold">{answer.evidence.comparison.differenceCents > 0 ? "+" : ""}{money(answer.evidence.comparison.differenceCents)}</p></div></>}</div>
      {answer.evidence.comparison && <p className="mb-3 text-xs text-slate-500">Supporting transactions include both periods. The totals above count each period separately.</p>}
      {answer.evidence.matches.length ? <DataTable label="Transactions supporting the answer" headers={["Date", "Description", "Merchant", "Category", "Amount", "Review"]}>{answer.evidence.matches.map(row => <tr key={row.id}><Cell>{row.date}</Cell><Cell>{row.description}</Cell><Cell>{row.merchant || "Not assigned"}</Cell><Cell>{row.category}</Cell><Cell>{money(row.amountCents)}</Cell><Cell><button className="text-indigo-700 underline" disabled={!expenses.some(expense => expense.id === row.id)} onClick={() => { const expense = expenses.find(e => e.id === row.id); if (expense) onEdit(expense); }}>View entry</button></Cell></tr>)}</DataTable> : <Empty>No matching records. This answer reflects only expenses recorded in V3.</Empty>}
      <p className="mt-3 text-xs text-slate-500">This answer is a snapshot of records when you asked. Ask again after editing an expense. The assistant cannot modify or delete expenses.</p>
    </Panel>;
}
