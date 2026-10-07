"use client";

import { useEffect, useState } from "react";
import type { AccountingExpense } from "@/types/accounting";
import type { AIStatus, QueryResponse } from "@/lib/ai/types";
import { Cell, DataTable, Empty, money, Notice, Panel } from "./shared";

const unavailableStatus = (message: string): AIStatus => ({ reachable: false, modelReady: false, model: "qwen3.5:4b", localOnly: true, error: message });

async function readStatus(signal?: AbortSignal): Promise<AIStatus> {
  const response = await fetch("/api/ai/status", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The local AI status could not be checked.");
  return data as AIStatus;
}

export default function LocalAssistant({ expenses, month, onEdit }: { expenses: AccountingExpense[]; month: string; onEdit: (expense: AccountingExpense) => void }) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [answerSnapshot, setAnswerSnapshot] = useState<{ result: QueryResponse; expenses: AccountingExpense[]; month: string } | null>(null);
  const answer = answerSnapshot?.expenses === expenses && answerSnapshot.month === month ? answerSnapshot.result : null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  async function checkStatus() {
    setChecking(true);
    try { setStatus(await readStatus(AbortSignal.timeout(15_000))); }
    catch (reason) { setStatus(unavailableStatus(reason instanceof Error ? reason.message : "Local AI unavailable.")); }
    finally { setChecking(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    readStatus(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])).then(setStatus).catch(reason => { if (!controller.signal.aborted) setStatus(unavailableStatus(reason instanceof Error ? reason.message : "Local AI unavailable.")); });
    return () => controller.abort();
  }, []);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setAnswerSnapshot(null);
    try {
      const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, expenses, month }), signal: AbortSignal.timeout(180_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The question could not be answered.");
      setAnswerSnapshot({ result: data as QueryResponse, expenses, month });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The local AI did not respond. Your expenses are unchanged."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <Panel title="Ask your expenses" description="Ask a question in everyday language. The local model selects a query; the app calculates the answer from your records.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="text-sm font-semibold">{status?.modelReady ? "Local AI ready" : status?.model === "disabled" ? "Local AI disabled" : status ? "Local AI needs setup" : "Checking local AI…"}</p><p className="mt-1 text-xs text-slate-500">{status?.model || "qwen3.5:4b"}{status?.version ? ` · Ollama ${status.version}` : ""} · Runs on this computer</p></div><button className="btn-secondary" onClick={checkStatus} disabled={checking}>{checking ? "Checking…" : "Check connection"}</button></div>
      {status && !status.modelReady && <Notice>Run Setup-V3.cmd once, then Start-V3.cmd. {status.error || "The model must be downloaded before questions or receipt reading can run."} Your reports and manual entry work without AI.</Notice>}
      <div className="my-4 flex flex-wrap gap-2">{["How much did I spend this month?", "Compare this month with last month", "Which categories did I spend the most on?", "Show Food expenses this month"].map(example => <button key={example} className="rounded-full border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:border-indigo-400" onClick={() => setQuestion(example)}>{example}</button>)}</div>
      <form onSubmit={ask} className="space-y-3"><label className="label" htmlFor="ai-question">Your question</label><textarea id="ai-question" className="input min-h-24" maxLength={1000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Compare Food spending this month with last month" required /><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">“This month” uses the selected report month: {month}.</p><button className="btn-primary" disabled={busy || !question.trim() || !status?.modelReady}>{busy ? "Working locally…" : "Ask local AI"}</button></div></form>
      {busy && <p role="status" className="mt-4 text-sm text-slate-500">Reading your question. The first response can take longer while the model loads.</p>}
      {error && <div className="mt-4"><Notice error>{error}</Notice></div>}
    </Panel>
    {answer && <Panel title="Answer with evidence" description={`${answer.evidence.period.from} through ${answer.evidence.period.to} · ${answer.model}`}>
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
    </Panel>}
  </div>;
}
