"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { AccountingExpense, Receipt } from "@/types/accounting";
import { CATEGORIES, isCategory, type Category } from "@/types/expense";
import type { ReceiptResponse } from "@/lib/ai/types";
import { prepareReceiptImage } from "@/lib/receipt-file";
import { parseISODate, todayISO } from "@/lib/format";
import { MAX_AMOUNT } from "@/lib/expenses";
import Modal from "@/components/Modal";
import type { WorkspaceController } from "./types";
import { Empty, money, Notice, Panel, useFeedback } from "./shared";

type DraftReceipt = Omit<Receipt, "id" | "createdAt">;
interface ReceiptFields { date: string; amount: string; merchant: string; description: string; category: Category | "" }

function ReceiptReview({ receipt, controller, onClose, onSaved }: { receipt: Receipt; controller: WorkspaceController; onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<ReceiptFields>(() => ({ date: receipt.extracted?.date ?? "", amount: receipt.extracted?.amount?.toFixed(2) ?? "", merchant: receipt.extracted?.merchant ?? "", description: receipt.extracted?.description ?? "", category: receipt.extracted?.category ?? "" }));
  const [errors, setErrors] = useState<Partial<Record<keyof ReceiptFields, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const linked = controller.workspace.expenses.filter(expense => expense.receiptId === receipt.id);
  const update = <K extends keyof ReceiptFields>(field: K, value: ReceiptFields[K]) => { setFields(previous => ({ ...previous, [field]: value })); setErrors(previous => { const next = { ...previous }; delete next[field]; return next; }); setSaveError(""); };

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof ReceiptFields, string>> = {};
    const amount = fields.amount.trim();
    if (fields.date && (!parseISODate(fields.date) || fields.date > todayISO())) nextErrors.date = "Enter a real receipt date that is today or earlier, or leave it blank.";
    if (amount && (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > MAX_AMOUNT)) nextErrors.amount = "Enter a positive USD amount up to $1,000,000 with at most two decimal places, or leave it blank.";
    if (fields.merchant.trim().length > 120) nextErrors.merchant = "Keep the merchant name to 120 characters.";
    if (fields.description.trim().length > 2000) nextErrors.description = "Keep the receipt description to 2,000 characters.";
    if (fields.category && !isCategory(fields.category)) nextErrors.category = "Choose a listed category, or leave it unassigned.";
    setErrors(nextErrors); setSaveError("");
    if (Object.keys(nextErrors).length) return;
    const extracted: NonNullable<Receipt["extracted"]> = {};
    if (fields.date) extracted.date = fields.date;
    if (amount) extracted.amount = Math.round(Number(amount) * 100) / 100;
    if (fields.merchant.trim()) extracted.merchant = fields.merchant.trim();
    if (fields.description.trim()) extracted.description = fields.description.trim();
    if (fields.category) extracted.category = fields.category;
    setSaving(true);
    try {
      const outcome = await controller.updateReceipt(receipt.id, { extracted });
      if (outcome.ok) onSaved();
      else setSaveError(outcome.error || "The receipt details could not be saved.");
    } catch (error) { setSaveError(error instanceof Error ? error.message : "The receipt details could not be saved."); }
    finally { setSaving(false); }
  }

  return <Modal title="Review receipt details" size="wide" onClose={() => { if (!saving) onClose(); }}>
    <p className="mb-5 text-sm text-slate-600">Read the image and correct any fields the AI missed. These saved details support receipt coverage and month-end checks. Linked expense entries stay unchanged.</p>
    <div className="grid gap-6 md:grid-cols-2">
      <div><Image unoptimized src={receipt.dataUrl} alt={`Receipt to check: ${receipt.filename}`} width={720} height={1000} className="h-auto max-h-[70vh] w-full rounded-lg border border-slate-200 object-contain" /><p className="mt-2 break-words text-xs text-slate-500">{receipt.filename}</p>{linked.length > 0 && <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">Currently linked expense</p>{linked.map(expense => <p key={expense.id} className="mt-2 text-sm">{expense.date} · {expense.description} · {money(Math.round(expense.amount * 100))}</p>)}</div>}</div>
      <form onSubmit={save} noValidate className="space-y-4">
        <div><label className="label" htmlFor="receipt-review-date">Receipt date</label><input id="receipt-review-date" data-initial-focus type="date" max={todayISO()} className={`input ${errors.date ? "input-error" : ""}`} value={fields.date} onChange={event => update("date", event.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? "receipt-review-date-error" : undefined} />{errors.date && <p id="receipt-review-date-error" className="mt-1 text-xs text-rose-600">{errors.date}</p>}</div>
        <div><label className="label" htmlFor="receipt-review-amount">Paid total (USD)</label><input id="receipt-review-amount" type="text" inputMode="decimal" className={`input ${errors.amount ? "input-error" : ""}`} placeholder="e.g. 12.50" value={fields.amount} onChange={event => update("amount", event.target.value)} aria-invalid={!!errors.amount} aria-describedby={errors.amount ? "receipt-review-amount-error" : "receipt-review-amount-help"} /><p id="receipt-review-amount-help" className="mt-1 text-xs text-slate-500">Use the final paid total shown on the receipt.</p>{errors.amount && <p id="receipt-review-amount-error" className="mt-1 text-xs text-rose-600">{errors.amount}</p>}</div>
        <div><label className="label" htmlFor="receipt-review-merchant">Merchant</label><input id="receipt-review-merchant" type="text" className={`input ${errors.merchant ? "input-error" : ""}`} maxLength={120} value={fields.merchant} onChange={event => update("merchant", event.target.value)} aria-invalid={!!errors.merchant} aria-describedby={errors.merchant ? "receipt-review-merchant-error" : undefined} />{errors.merchant && <p id="receipt-review-merchant-error" className="mt-1 text-xs text-rose-600">{errors.merchant}</p>}</div>
        <div><label className="label" htmlFor="receipt-review-description">Description</label><textarea id="receipt-review-description" className={`input min-h-20 ${errors.description ? "input-error" : ""}`} maxLength={2000} value={fields.description} onChange={event => update("description", event.target.value)} aria-invalid={!!errors.description} aria-describedby={errors.description ? "receipt-review-description-error" : undefined} />{errors.description && <p id="receipt-review-description-error" className="mt-1 text-xs text-rose-600">{errors.description}</p>}</div>
        <div><label className="label" htmlFor="receipt-review-category">Category</label><select id="receipt-review-category" className={`input ${errors.category ? "input-error" : ""}`} value={fields.category} onChange={event => update("category", event.target.value as Category | "")} aria-invalid={!!errors.category} aria-describedby={errors.category ? "receipt-review-category-error" : undefined}><option value="">Unassigned</option>{CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}</select>{errors.category && <p id="receipt-review-category-error" className="mt-1 text-xs text-rose-600">{errors.category}</p>}</div>
        <p className="text-xs text-slate-500">Leave unreadable fields blank. A blank value is unavailable, not verified. Saving adds a receipt update to the change history.</p>
        {Object.keys(errors).length > 0 && <Notice error>Correct the highlighted fields before saving.</Notice>}
        {saveError && <Notice error>{saveError}</Notice>}
        <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save reviewed details"}</button><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  </Modal>;
}

export default function ReceiptInbox({ controller, onCreate }: { controller: WorkspaceController; onCreate: (defaults: Partial<AccountingExpense>) => void }) {
  const [draft, setDraft] = useState<DraftReceipt | null>(null);
  const [preview, setPreview] = useState<Receipt | null>(null);
  const [reviewing, setReviewing] = useState<Receipt | null>(null);
  const [removing, setRemoving] = useState<Receipt | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<Record<string, string>>({});
  const { feedback, setFeedback, result } = useFeedback();
  const { workspace } = controller;

  async function readReceipt() {
    if (!draft) return;
    setBusy(true); setWarnings([]); setFeedback(null);
    try {
      const response = await fetch("/api/ai/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: draft.dataUrl }), signal: AbortSignal.timeout(180_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The receipt could not be read.");
      const receiptResult = data as ReceiptResponse;
      const values = receiptResult.extracted;
      const extracted: Receipt["extracted"] = {};
      if (values.date) extracted.date = values.date;
      if (values.amount !== null && values.amount !== undefined) extracted.amount = values.amount;
      if (values.merchant) extracted.merchant = values.merchant;
      if (values.description) extracted.description = values.description;
      if (values.category) extracted.category = values.category;
      setDraft({ ...draft, extracted });
      setWarnings(receiptResult.warnings || []);
      setFeedback({ message: "Draft read locally. Check every field against the image before using it." });
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : "Local AI unavailable. You can save the image and enter the expense manually.", error: true }); }
    finally { setBusy(false); }
  }

  async function saveReceipt(createExpense: boolean) {
    if (!draft) return;
    const outcome = await controller.addReceipt(draft);
    if (result(outcome, "Receipt saved on this device.")) {
      if (createExpense && outcome.id) onCreate({ ...draft.extracted, receiptId: outcome.id });
      setDraft(null); setWarnings([]);
    }
  }

  async function removeReceipt() {
    if (!removing) return;
    setRemovingBusy(true); setRemoveError("");
    try {
      const outcome = await controller.removeReceipt(removing.id);
      if (outcome.ok) { setRemoving(null); setFeedback({ message: "Unattached receipt removed from this workspace." }); }
      else setRemoveError(outcome.error || "The receipt could not be removed.");
    } catch (error) { setRemoveError(error instanceof Error ? error.message : "The receipt could not be removed."); }
    finally { setRemovingBusy(false); }
  }

  return <div className="space-y-6">
    <Panel title="Receipt inbox" description="Keep supporting images with your expenses. Local AI can read a draft; you always review the entry before saving it.">
      <label className="label" htmlFor="receipt-upload">Choose a receipt image</label><input id="receipt-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="input max-w-xl file:mr-4 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-700" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setFeedback(null); setWarnings([]); try { const image = await prepareReceiptImage(file); setDraft({ ...image, filename: file.name }); } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : "The image could not be opened." }); } }} />
      <p className="mt-2 text-xs text-slate-500">JPEG, PNG, or WebP up to 10 MB. Images are resized and stripped of metadata before local storage. Export a full backup to move receipts to another machine.</p>
      {feedback && <div className="mt-4"><Notice error={feedback.error}>{feedback.message}</Notice></div>}
      {draft && <div className="mt-6 grid gap-6 sm:grid-cols-[180px_1fr]"><Image unoptimized src={draft.dataUrl} alt="Selected receipt for review" width={180} height={240} className="max-h-72 w-full rounded-lg border border-slate-200 object-contain" /><div><h3 className="font-semibold">{draft.filename}</h3><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt className="text-slate-500">Merchant</dt><dd>{draft.extracted?.merchant || "Not read"}</dd><dt className="text-slate-500">Date</dt><dd>{draft.extracted?.date || "Not read"}</dd><dt className="text-slate-500">Amount</dt><dd>{draft.extracted?.amount === undefined ? "Not read" : money(Math.round(draft.extracted.amount * 100))}</dd><dt className="text-slate-500">Suggested category</dt><dd>{draft.extracted?.category || "Not read"}</dd></dl>{warnings.length > 0 && <ul className="mt-3 list-inside list-disc text-xs text-amber-800">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}<div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" disabled={busy} onClick={readReceipt}>{busy ? "Reading locally…" : "Read with local AI"}</button><button className="btn-secondary" disabled={busy} onClick={() => saveReceipt(false)}>Save receipt only</button><button className="btn-secondary" disabled={busy} onClick={() => saveReceipt(true)}>Review new expense</button><button className="text-sm text-slate-500 underline" disabled={busy} onClick={() => setDraft(null)}>Discard draft</button></div><p className="mt-3 text-xs text-slate-500">If the model cannot read a field, enter it yourself in the expense form. The receipt is never treated as a verified expense automatically.</p></div></div>}
    </Panel>
    <Panel title="Saved receipts" description={`${workspace.receipts.length} receipt images stored in this browser`}>
      {workspace.receipts.length ? <ul className="space-y-5">{workspace.receipts.map(receipt => {
        const linked = workspace.expenses.filter(expense => expense.receiptId === receipt.id);
        return <li key={receipt.id} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-[100px_1fr]">
          <button type="button" onClick={() => setPreview(receipt)} aria-label={`View receipt ${receipt.filename}`}><Image unoptimized src={receipt.dataUrl} alt={receipt.filename} width={100} height={120} className="max-h-32 w-full rounded-lg object-contain" /></button>
          <div>
            <p className="break-words text-sm font-semibold">{receipt.filename}</p>
            <p className="mt-1 text-xs text-slate-500">{receipt.extracted?.merchant || "Merchant not read"}{receipt.extracted?.date ? ` · ${receipt.extracted.date}` : ""}{receipt.extracted?.amount !== undefined ? ` · ${money(Math.round(receipt.extracted.amount * 100))}` : ""}</p>
            <p className="mt-2 text-sm">{linked.length ? `Attached to: ${linked.map(expense => expense.description).join(", ")}` : "Not attached to an expense"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setFeedback(null); setReviewing(receipt); }}>Review receipt details</button>
              {linked.map(expense => <button key={expense.id} type="button" className="btn-secondary" aria-label={`Detach receipt from ${expense.description}`} onClick={async () => result(await controller.attachReceipt(expense.id, null), "Receipt detached. The expense and saved image are retained; choose the correct expense to attach it again.")}>Detach receipt</button>)}
              {!linked.length && <button type="button" className="px-3 py-2 text-sm text-rose-700 underline" onClick={() => { setRemoveError(""); setRemoving(receipt); }}>Remove saved receipt</button>}
            </div>
            {!linked.length && <div className="mt-3 flex flex-wrap gap-2"><label className="min-w-48 flex-1 text-xs text-slate-500">Existing expense<select className="input mt-1" value={selectedExpense[receipt.id] || ""} onChange={event => setSelectedExpense({ ...selectedExpense, [receipt.id]: event.target.value })}><option value="">Choose an expense</option>{workspace.expenses.filter(expense => !expense.receiptId).map(expense => <option key={expense.id} value={expense.id}>{expense.date} · {expense.description} · {money(Math.round(expense.amount * 100))}</option>)}</select></label><button className="btn-secondary self-end" disabled={!selectedExpense[receipt.id]} onClick={async () => result(await controller.attachReceipt(selectedExpense[receipt.id], receipt.id), "Receipt attached. The coverage report has been updated.")}>Attach receipt</button><button className="btn-secondary self-end" onClick={() => onCreate({ ...receipt.extracted, receiptId: receipt.id })}>Create expense</button></div>}
          </div>
        </li>;
      })}</ul> : <Empty>No receipts saved yet.</Empty>}
    </Panel>
    {preview && <Modal title="Receipt image" onClose={() => setPreview(null)} size="wide"><Image unoptimized src={preview.dataUrl} alt={`Full receipt: ${preview.filename}`} width={1000} height={1400} className="h-auto w-full object-contain" /><p className="mt-3 text-xs text-slate-500">{preview.filename}</p></Modal>}
    {reviewing && <ReceiptReview key={reviewing.id} receipt={reviewing} controller={controller} onClose={() => setReviewing(null)} onSaved={() => { setReviewing(null); setFeedback({ message: "Reviewed receipt details saved. Receipt coverage and month-end checks have been updated; linked expense values are unchanged." }); }} />}
    {removing && <Modal title="Remove saved receipt?" onClose={() => { if (!removingBusy) setRemoving(null); }}><p className="text-sm text-slate-600">Remove <strong className="break-words">{removing.filename}</strong> and its saved image from this workspace? This receipt is not attached to an expense. Export a full backup first if you need to keep a copy.</p>{removeError && <div className="mt-4"><Notice error>{removeError}</Notice></div>}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" data-initial-focus className="btn-secondary" disabled={removingBusy} onClick={() => setRemoving(null)}>Keep receipt</button><button type="button" className="btn-primary" disabled={removingBusy} onClick={removeReceipt}>{removingBusy ? "Removing…" : "Remove receipt"}</button></div></Modal>}
  </div>;
}
