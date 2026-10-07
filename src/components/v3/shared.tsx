"use client";

import { useState } from "react";
import { downloadExportFile } from "@/lib/export/download";
import { formatCurrency } from "@/lib/format";

export function money(cents: number) { return formatCurrency(cents / 100); }

export function saveFile(filename: string, content: string, mimeType = "application/json;charset=utf-8") {
  downloadExportFile({ filename, content, mimeType });
}

export function saveBinary(filename: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-sm ${error ? "bg-rose-50 text-rose-800" : "bg-indigo-50 text-indigo-900"}`}>{children}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</p>;
}

export function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return <div className="card min-w-0 p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>;
}

export function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="card p-4 sm:p-6"><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}<div className="mt-5">{children}</div></section>;
}

export function DataTable({ headers, children, label }: { headers: string[]; children: React.ReactNode; label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-500"><table className="w-full text-left text-sm"><caption className="sr-only">{label}</caption><thead className="bg-slate-50 text-xs text-slate-500"><tr>{headers.map(h => <th key={h} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;
}

export function Cell({ children }: { children: React.ReactNode }) { return <td className="px-3 py-3 align-top">{children}</td>; }

export function useFeedback() {
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const result = (outcome: { ok: boolean; error?: string }, success: string) => {
    setFeedback({ message: outcome.ok ? success : outcome.error || "The change could not be saved.", error: !outcome.ok });
    return outcome.ok;
  };
  return { feedback, setFeedback, result };
}
