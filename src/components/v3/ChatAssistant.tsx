"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AccountingExpense } from "@/types/accounting";
import type { AIStatus, QueryResponse } from "@/lib/ai/types";
import type { QueryPlan } from "@/lib/ai/query";
import { REPORT_QUESTIONS } from "@/lib/ai/report-questions";
import { jsonLines, recentChatContext } from "@/lib/ai/conversation";
import { chatStore, completedChatTurns, type ChatMode, type Conversation, type SavedMessage } from "@/lib/chat-store";
import { retainedBrowserChats } from "@/lib/chat-platform";
import { downloadExportFile } from "@/lib/export/download";
import Modal from "@/components/Modal";
import FinancialEvidence from "./LocalAssistant";
import { Notice, Panel } from "./shared";

const nameOf = (mode: ChatMode) => mode === "finance" ? "Finance" : "General chat";
const chatIdentifier = (chat: Conversation) => `${chat.mode === "finance" ? "FIN" : "GEN"}-${chat.id.slice(0, 8)}`;
const stamp = (at: number) => new Date(at).toLocaleString();
const message = (role: SavedMessage["role"], content: string, status: SavedMessage["status"] = "complete"): SavedMessage => ({ id: crypto.randomUUID(), role, content, status, at: Date.now() });
async function readAIStatus(signal: AbortSignal): Promise<AIStatus> {
  const response = await fetch("/api/ai/status", { cache: "no-store", signal });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Unable to check local AI.");
  return value;
}
const offlineStatus = (reason: unknown): AIStatus => ({ reachable: false, modelReady: false, model: "qwen3.5:4b", localOnly: true, error: reason instanceof Error ? reason.message : "Local AI unavailable." });
function previousFinancialPlan(chat: Conversation): QueryPlan | null {
  const evidence = chat.messages.findLast(item => item.result)?.result?.evidence;
  if (!evidence) return null;
  return { intent: evidence.intent, allTime: false, from: evidence.period.from, to: evidence.period.to, category: evidence.filters.category, merchant: evidence.filters.merchant, search: evidence.filters.search, compareFrom: evidence.comparison?.from ?? null, compareTo: evidence.comparison?.to ?? null };
}

function Transcript({ chat, live, expenses, onEdit }: { chat?: Conversation; live?: string; expenses: AccountingExpense[]; onEdit: (expense: AccountingExpense) => void }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [chat?.id, chat?.messages.length, live]);
  return <>
    {!chat?.messages.length && <p className="py-8 text-sm text-slate-500">{chat?.mode === "finance" ? "Ask about recorded expenses. Follow-up questions stay in this financial conversation." : "Start a conversation with your local AI. Only this selected chat is sent to the model."}</p>}
    {chat?.messages.map(item => <article key={item.id} className={`mb-4 rounded-xl border p-4 ${item.role === "user" ? "border-indigo-100 bg-indigo-50" : "border-slate-200 bg-white"}`}>
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><strong>{item.role === "user" ? "You" : `${nameOf(chat.mode)} assistant`}</strong><time dateTime={new Date(item.at).toISOString()}>{stamp(item.at)}</time></div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.content}</p>
      {item.status !== "complete" && <p className="mt-2 text-xs text-amber-700">{item.status === "stopped" ? "Stopped / incomplete" : "Not answered"} · This response is excluded from future model context.</p>}
      {item.result && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-indigo-700">View calculation evidence · saved snapshot · report month {item.month}</summary><div className="mt-3"><FinancialEvidence answer={item.result} expenses={expenses} onEdit={onEdit} /></div></details>}
    </article>)}
    {live !== undefined && <article className="mb-4 rounded-xl border border-slate-200 p-4"><p className="mb-2 text-xs font-semibold text-slate-500">General chat assistant · responding</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{live || "Loading the local model…"}</p></article>}
    <div ref={bottom} />
  </>;
}

export default function ChatAssistant({ expenses, month, financeVisible, toolsVisible, popupOpen, onPopupChange, onShowFinance, onShowTools, onEdit }: {
  expenses: AccountingExpense[]; month: string; financeVisible: boolean; toolsVisible: boolean; popupOpen: boolean;
  onPopupChange: (open: boolean) => void; onShowFinance: () => void; onShowTools: () => void; onEdit: (expense: AccountingExpense) => void;
}) {
  const snapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot, chatStore.getServerSnapshot);
  const [selected, setSelected] = useState<Partial<Record<ChatMode, string>>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingDrafts = useRef(new Map<string, string>());
  const switching = useRef(false);
  const popupVisible = useRef(popupOpen);
  useEffect(() => { popupVisible.current = popupOpen; }, [popupOpen]);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingChat = useRef(false);
  const firstChatCreation = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestBusy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [live, setLive] = useState<{ id: string; content: string } | null>(null);
  const [unsaved, setUnsaved] = useState<{ id: string; message: SavedMessage } | null>(null);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<{ id: string; question: string } | null>(null);
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [modeFilter, setModeFilter] = useState<"all" | ChatMode>("all");
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ordered = [...snapshot.archive.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const active = (mode: ChatMode) => ordered.find(chat => chat.id === selected[mode] && chat.mode === mode) ?? ordered.find(chat => chat.mode === mode);
  const finance = active("finance"), general = active("general");
  const current = popupOpen ? general : finance;
  const busy = busyId !== null;

  useEffect(() => {
    if (snapshot.loaded && busyId && !snapshot.archive.conversations.some(chat => chat.id === busyId)) abort.current?.abort();
  }, [snapshot.loaded, snapshot.archive.conversations, busyId]);

  useEffect(() => {
    if (!context) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest("[data-chat-menu], [data-chat-menu-trigger]")) setContext(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setContext(null); document.querySelector<HTMLButtonElement>(`[data-chat-action-id="${CSS.escape(context.id)}"]`)?.focus(); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape, true); };
  }, [context]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await readAIStatus(AbortSignal.timeout(15_000)));
    } catch (reason) { setStatus(offlineStatus(reason)); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    void chatStore.load();
    const controller = new AbortController();
    readAIStatus(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])).then(setStatus).catch(reason => { if (!controller.signal.aborted) setStatus(offlineStatus(reason)); });
    return () => { controller.abort(); abort.current?.abort(); };
  }, [checkStatus]);
  useEffect(() => {
    const mode = popupOpen ? "general" : financeVisible ? "finance" : null;
    if (!mode || !snapshot.loaded || snapshot.error || (mode === "general" ? general : finance) || firstChatCreation.current || creatingChat.current) return;
    firstChatCreation.current = true;
    chatStore.create(mode).then(id => { if (id) setSelected(old => ({ ...old, [mode]: id })); }).finally(() => { firstChatCreation.current = false; });
  }, [popupOpen, financeVisible, snapshot.loaded, snapshot.error, general, finance, creating]);

  function setDraft(chat: Conversation, value: string) {
    setDrafts(old => ({ ...old, [chat.id]: value }));
    pendingDrafts.current.set(chat.id, value);
    clearTimeout(draftTimers.current.get(chat.id));
    draftTimers.current.set(chat.id, setTimeout(() => {
      draftTimers.current.delete(chat.id);
      void saveDraft(chat.id, value);
    }, 300));
  }
  async function saveDraft(id: string, value: string) {
    const saved = await chatStore.update(id, item => { item.draft = value; });
    if (saved && pendingDrafts.current.get(id) === value) pendingDrafts.current.delete(id);
    return saved;
  }
  async function flushDrafts() {
    for (const [id, value] of pendingDrafts.current) {
      clearTimeout(draftTimers.current.get(id)); draftTimers.current.delete(id);
      if (!await saveDraft(id, value)) return false;
    }
    return true;
  }
  function showGeneralPopup() {
    // There is one controlled dialog; repeated requests reuse it.
    if (!popupVisible.current) { popupVisible.current = true; onPopupChange(true); }
    setHistoryOpen(false);
  }
  async function openGeneral() {
    if (switching.current) return;
    switching.current = true;
    try { if (await flushDrafts()) showGeneralPopup(); }
    finally { switching.current = false; }
  }
  async function closePopup(showFinance = false) {
    if (switching.current) return;
    switching.current = true;
    try {
      if (!await flushDrafts()) return;
      setContext(null); popupVisible.current = false; onPopupChange(false);
      if (showFinance) onShowFinance();
    } finally { switching.current = false; }
  }
  async function newChat(mode: ChatMode, initialDraft = "") {
    if (creatingChat.current || firstChatCreation.current || !snapshot.loaded) return null;
    creatingChat.current = true;
    setCreating(true); setError("");
    try {
      if (!await flushDrafts()) return null;
      const id = await chatStore.create(mode, initialDraft);
      if (id) {
        setSelected(old => ({ ...old, [mode]: id }));
        setDrafts(old => ({ ...old, [id]: initialDraft }));
      }
      return id;
    } finally { creatingChat.current = false; setCreating(false); }
  }
  async function openSaved(chat: Conversation) {
    if (switching.current) return;
    switching.current = true;
    try {
      if (!await flushDrafts()) return;
      setSelected(old => ({ ...old, [chat.mode]: chat.id })); setContext(null); setRename(null);
      if (chat.mode === "finance") { popupVisible.current = false; onPopupChange(false); onShowFinance(); }
      else showGeneralPopup();
    } finally { switching.current = false; }
  }
  async function handoffToGeneral(question: string) {
    if (switching.current) return false;
    switching.current = true;
    try {
      // Preserve the previous general chat and draft in its own saved conversation.
      const id = await newChat("general", question);
      if (!id) return false;
      showGeneralPopup();
      return true;
    } finally { switching.current = false; }
  }
  async function persistReply(id: string, reply: SavedMessage) {
    const saved = await chatStore.update(id, chat => { if (!chat.messages.some(item => item.id === reply.id)) chat.messages.push(reply); });
    if (!saved) {
      await chatStore.reload();
      if (!chatStore.getSnapshot().archive.conversations.some(chat => chat.id === id)) {
        setUnsaved(null); setError("This chat was deleted in another window. Its reply was not saved. Open or start another chat to continue.");
      } else setUnsaved({ id, message: reply });
    } else setUnsaved(null);
  }
  async function openTools() {
    if (switching.current) return;
    switching.current = true;
    try {
      if (!await flushDrafts()) return;
      setContext(null); popupVisible.current = false; onPopupChange(false); onShowTools();
    } finally { switching.current = false; }
  }
  async function requestDelete(chat: Conversation) {
    if (busyId === chat.id || unsaved?.id === chat.id || deleting) return;
    setContext(null); setRename(null);
    if (!await flushDrafts()) return;
    const latest = chatStore.getSnapshot().archive.conversations.find(item => item.id === chat.id);
    if (latest) setDeleteTarget(latest);
  }
  async function confirmDelete() {
    if (!deleteTarget || deleting || busyId === deleteTarget.id || unsaved?.id === deleteTarget.id) return;
    setDeleting(true);
    try {
      const id = deleteTarget.id;
      if (!await chatStore.remove(id, deleteTarget.updatedAt)) return;
      clearTimeout(draftTimers.current.get(id)); draftTimers.current.delete(id); pendingDrafts.current.delete(id);
      setDrafts(old => { const next = { ...old }; delete next[id]; return next; });
      setSelected(old => { const next = { ...old }; if (next[deleteTarget.mode] === id) delete next[deleteTarget.mode]; return next; });
      setDeleteTarget(null); setError("");
    } finally { setDeleting(false); }
  }
  function openMenu(chat: Conversation, x: number, y: number) {
    setContext({ id: chat.id, x: Math.max(8, Math.min(x, window.innerWidth - 224)), y: Math.max(8, Math.min(y, window.innerHeight - 150)) });
  }
  function contextMenu() {
    const chat = ordered.find(item => item.id === context?.id);
    if (!context || !chat) return null;
    return <div ref={menuRef} data-chat-menu role="menu" tabIndex={-1} aria-label={`Actions for ${chatIdentifier(chat)}`} className="fixed z-50 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-xl" style={{ left: context.x, top: context.y }} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>
      <button type="button" role="menuitem" className="block w-full rounded p-2 text-left text-sm hover:bg-slate-50" onClick={() => void openSaved(chat)}>Open chat</button>
      <button type="button" role="menuitem" className="block w-full rounded p-2 text-left text-sm hover:bg-slate-50" onClick={() => { setRename({ id: chat.id, title: chat.title }); setContext(null); }}>Rename chat</button>
      <button type="button" role="menuitem" className="block w-full rounded p-2 text-left text-sm text-red-700 hover:bg-red-50" disabled={busyId === chat.id || unsaved?.id === chat.id} onClick={() => void requestDelete(chat)}>Delete chat</button>
    </div>;
  }

  async function ask(mode: ChatMode, chat: Conversation) {
    if (requestBusy.current || unsaved) return;
    const question = (drafts[chat.id] ?? chat.draft).trim();
    if (!question || !status?.modelReady) return;
    requestBusy.current = true; setBusyId(chat.id); setError(""); setSuggestion(null);
    const controller = new AbortController(); abort.current = controller;
    let text = "";
    try {
      clearTimeout(draftTimers.current.get(chat.id)); draftTimers.current.delete(chat.id);
      const saved = await chatStore.update(chat.id, item => {
        if (item.mode !== mode) throw new Error("Conversation mode changed. Reopen the correct entry area.");
        if (item.messages.length > 198) throw new Error("This chat has reached 200 messages. Start a new conversation.");
        if (!item.messages.length) item.title = question.replace(/\s+/g, " ").slice(0, 80);
        item.draft = ""; item.messages.push(message("user", question));
      });
      if (!saved) return;
      pendingDrafts.current.delete(chat.id);
      setDrafts(old => ({ ...old, [chat.id]: "" }));
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(190_000)]);
      if (mode === "finance") {
        const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify({ question, expenses, month, suggestScope: true, context: { questions: chat.messages.filter(item => item.role === "user").slice(-6).map(item => item.content), plan: previousFinancialPlan(chat) } }) });
        const data = await response.json();
        if (!response.ok) {
          if (data.suggestedMode === "general") {
            setSuggestion({ id: chat.id, question });
            await persistReply(chat.id, message("assistant", "This question belongs in General chat. Your question is ready there; press Send to continue. No expense records are passed to General chat.", "failed"));
            if (await handoffToGeneral(question)) { setSuggestion(null); setError(""); }
            return;
          }
          throw new Error(data.error || "The financial question could not be answered.");
        }
        await persistReply(chat.id, { ...message("assistant", (data as QueryResponse).answer), result: data as QueryResponse, month });
      } else {
        setLive({ id: chat.id, content: "" });
        const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify({ messages: recentChatContext([...completedChatTurns(chat), { role: "user", content: question }]) }) });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || "General chat could not start."); }
        if (!response.body) throw new Error("No chat response was returned.");
        let done = false, truncated = false;
        for await (const event of jsonLines(response.body)) {
          const value = event as { type: string; content?: string; error?: string; truncated?: boolean };
          if (value.type === "delta" && typeof value.content === "string") { text += value.content; setLive({ id: chat.id, content: text }); }
          else if (value.type === "error") throw new Error(value.error || "The response was interrupted.");
          else if (value.type === "done") { done = true; truncated = value.truncated === true; }
          else throw new Error("The chat returned an invalid event.");
        }
        if (!done) throw new Error("The chat was interrupted. Try again.");
        await persistReply(chat.id, message("assistant", truncated ? `${text}\n\n[Response reached the length limit. Ask a shorter question for a complete answer.]` : text, truncated ? "stopped" : "complete"));
      }
    } catch (reason) {
      const stopped = controller.signal.aborted;
      const explanation = stopped ? "Response stopped. Send your question again to retry." : reason instanceof Error ? reason.message : "The local AI did not respond.";
      setError(explanation);
      await persistReply(chat.id, message("assistant", text ? `${text}\n\n[${explanation}]` : explanation, stopped ? "stopped" : "failed"));
    } finally { setLive(null); setBusyId(null); requestBusy.current = false; abort.current = null; }
  }

  function composer(mode: ChatMode, chat?: Conversation) {
    if (!chat) return <button className="btn-primary" disabled={!snapshot.loaded || creating} onClick={() => void newChat(mode)}>Start {nameOf(mode).toLowerCase()}</button>;
    const value = drafts[chat.id] ?? chat.draft;
    const send = () => void ask(mode, chat);
    return <form className="space-y-2" onSubmit={event => { event.preventDefault(); send(); }}>
      <label className="label" htmlFor={`chat-input-${mode}`}>{mode === "finance" ? "Financial question" : "Message your local AI"}</label>
      <textarea id={`chat-input-${mode}`} data-initial-focus={mode === "general" ? true : undefined} className="input min-h-20 resize-y" rows={2} maxLength={mode === "finance" ? 1000 : 4000} value={value} onChange={event => setDraft(chat, event.target.value)} placeholder={mode === "finance" ? "e.g. How much did I spend on Food this month?" : "Ask a question or continue this conversation…"}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !unsaved) send(); } }} />
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Enter to send · Shift+Enter for a new line</p><div className="flex flex-wrap gap-2">{mode === "finance" && <button type="button" className="btn-secondary" aria-haspopup="dialog" onClick={() => void openGeneral()}>General chat</button>}{busy && <button type="button" className="btn-secondary" onClick={() => abort.current?.abort()}>Stop response</button>}<button className="btn-primary" disabled={busy || !!unsaved || !value.trim() || !status?.modelReady}>{busy ? "Working locally…" : `Send · ${nameOf(mode)}`}</button></div></div>
    </form>;
  }
  function alerts() {
    return <>
      {snapshot.error && <Notice error>{snapshot.error}</Notice>}
      {snapshot.warning && <Notice error>{snapshot.warning}</Notice>}
      {snapshot.warning && <button className="btn-secondary mt-2" onClick={() => void exportRetainedHistory()}>Export retained browser chats</button>}
      {error && <Notice error>{error}</Notice>}
      {unsaved && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>This reply is visible but could not be saved. Keep this page open and retry saving.</p><p className="mt-2 whitespace-pre-wrap break-words">{unsaved.message.content}</p><button className="btn-secondary mt-2" onClick={() => void persistReply(unsaved.id, unsaved.message)}>Retry saving reply</button></div>}
      {status && !status.modelReady && <Notice>Run Setup-V3.cmd and Start-V3.cmd with AI enabled. {status.error} Reports and manual entry remain available.</Notice>}
    </>;
  }
  const history = ordered.filter(chat => `${chat.title} ${chatIdentifier(chat)} ${chat.id} ${nameOf(chat.mode)} ${chat.messages.map(item => item.content).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  function chatRow(chat: Conversation, inTools = false) {
    return <div key={chat.id} className={`rounded-lg border p-3 ${!inTools && current?.id === chat.id ? "border-indigo-400 bg-white" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left" aria-label={`Open ${chat.title} (${chatIdentifier(chat)})`} aria-haspopup="menu" onClick={() => void openSaved(chat)} onContextMenu={event => { event.preventDefault(); openMenu(chat, event.clientX, event.clientY); }} onKeyDown={event => {
          if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu(chat, bounds.left, bounds.bottom); }
        }}>
          <p className="break-words text-sm font-medium">{chat.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded px-2 py-0.5 font-semibold ${chat.mode === "finance" ? "bg-emerald-50 text-emerald-800" : "bg-indigo-50 text-indigo-800"}`}>{chat.mode === "finance" ? "Finance" : "General"}</span><code title={chat.id} className="text-slate-500">{chatIdentifier(chat)}</code></div>
          <p className="mt-1 text-xs text-slate-500">{new Date(chat.updatedAt).toLocaleDateString()}{inTools ? ` · ${chat.messages.length} messages${chat.draft ? " · Saved draft" : ""}` : ""}</p>
        </button>
        <button type="button" data-chat-menu-trigger data-chat-action-id={chat.id} className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100" aria-label={`Actions for ${chat.title} (${chatIdentifier(chat)})`} aria-haspopup="menu" aria-expanded={context?.id === chat.id} onClick={event => { if (context?.id === chat.id) setContext(null); else { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(chat, bounds.right - 208, bounds.bottom); } }}>•••</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs"><button className="text-indigo-700 underline" aria-label={`Rename ${chat.title} (${chatIdentifier(chat)})`} onClick={() => { setRename({ id: chat.id, title: chat.title }); setContext(null); }}>Rename</button><button className="text-red-700 underline" aria-label={`Delete ${chat.title} (${chatIdentifier(chat)})`} disabled={busyId === chat.id || unsaved?.id === chat.id} onClick={() => void requestDelete(chat)}>Delete</button></div>
      {inTools && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Full chat identifier</summary><code className="mt-1 block break-all">{chat.id}</code></details>}
      {rename?.id === chat.id && <form className="mt-2 space-y-2" onSubmit={async event => { event.preventDefault(); if (rename.title.trim() && await chatStore.update(chat.id, item => { item.title = rename.title.trim(); })) setRename(null); }}><input className="input" aria-label="Conversation title" maxLength={100} value={rename.title} onChange={event => setRename({ id: chat.id, title: event.target.value })} /><div className="flex gap-2"><button className="text-indigo-700 underline">Save title</button><button type="button" onClick={() => setRename(null)}>Cancel</button></div></form>}
    </div>;
  }
  function exportHistory() {
    try { downloadExportFile({ content: JSON.stringify(snapshot.archive, null, 2), mimeType: "application/json", filename: "v3-chat-history.json" }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Chat history could not be exported."); }
  }
  async function exportRetainedHistory() {
    try {
      const raw = await retainedBrowserChats();
      if (raw) downloadExportFile({ content: raw, mimeType: "application/json", filename: "v3-retained-browser-chats.json" });
      else setError("No retained browser history is available in this profile.");
    } catch { setError("Retained browser history could not be exported. Keep this profile's data until migration is resolved."); }
  }
  function sidebar() {
    return <aside aria-label="Saved conversations" className="flex min-h-0 flex-col gap-3 rounded-xl bg-slate-50 p-3">
      <div className="flex gap-2"><button className="btn-secondary text-xs" disabled={!snapshot.loaded || creating} onClick={() => void newChat("general")}>New chat</button><button className="btn-secondary text-xs" onClick={() => void closePopup(true)}>Go to Finance</button></div>
      <button className="text-left text-xs text-indigo-700 underline" onClick={() => void openTools()}>Tools · Manage chats</button>
      <label className="text-xs font-medium text-slate-600">Search conversations<input type="search" className="input mt-1" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {history.map(chat => chatRow(chat))}
        {!history.length && <p className="text-xs text-slate-500">No saved conversations match.</p>}
      </div>
      <button className="text-left text-xs text-indigo-700 underline" disabled={!snapshot.loaded} onClick={exportHistory}>Export chat history</button>
      <p className="text-xs text-slate-500">Saved in local SQLite, separately from your financial backup. Right-click a chat or use its Actions button. Only recent completed turns fit the model context.</p>
    </aside>;
  }

  return <>
    {toolsVisible && !popupOpen && <Panel title="Tools · Chat history" description="Manage your saved General and Finance conversations.">
      <p className="mb-4 text-sm text-slate-600">Chats, drafts and financial answer snapshots are saved in <code>data/chats.sqlite</code> inside your V3 folder. All browser profiles using this V3 copy share that history. Expense records still use the financial workspace backup.</p>
      {snapshot.error && <Notice error>{snapshot.error}</Notice>}
      {snapshot.warning && <Notice error>{snapshot.warning}</Notice>}
      {snapshot.warning && <button className="btn-secondary mt-2" onClick={() => void exportRetainedHistory()}>Export retained browser chats</button>}
      {error && <Notice error>{error}</Notice>}
      <div className="my-4 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Search chats<input className="input mt-1" type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="text-sm">Chat type<select className="input mt-1" value={modeFilter} onChange={event => setModeFilter(event.target.value as typeof modeFilter)}><option value="all">All types</option><option value="general">General</option><option value="finance">Finance</option></select></label><button className="btn-secondary" onClick={() => void chatStore.reload()}>Refresh history</button><button className="btn-secondary" disabled={!snapshot.loaded} onClick={exportHistory}>Export chat history</button></div>
      <p className="mb-3 text-xs text-slate-500">{ordered.length} saved chats · {ordered.filter(chat => chat.mode === "general").length} General · {ordered.filter(chat => chat.mode === "finance").length} Finance. Right-click a title, press Shift+F10, or use ••• for actions. Deletion always asks Yes or No.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{history.filter(chat => modeFilter === "all" || chat.mode === modeFilter).map(chat => chatRow(chat, true))}</div>
      {!history.some(chat => modeFilter === "all" || chat.mode === modeFilter) && <p className="py-6 text-sm text-slate-500">No saved chats match.</p>}
      <p className="mt-4 text-xs text-slate-500">For another machine, stop V3 before copying its data folder, or export this chat archive for safekeeping. A permanent deletion removes the chat from this database; separate backups and exported files are not changed.</p>
      {contextMenu()}
    </Panel>}
    {financeVisible && <Panel title="Finance assistant" description={`Verified queries from your recorded expenses · Selected report month ${month}`}>
      <div className="mb-4 flex flex-wrap justify-between gap-3"><div><p className="text-sm font-semibold">{status?.modelReady ? "Local AI ready" : "Local AI needs setup"} · Finance mode</p><p className="mt-1 text-xs text-slate-500">{status?.model || "Checking model…"} · Verified expense reports; all totals are calculated by the app.</p></div><div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={checking} onClick={() => void checkStatus()}>Check connection</button><button className="btn-secondary" disabled={creating || !snapshot.loaded} onClick={() => void newChat("finance")}>New financial chat</button><button className="btn-secondary" aria-haspopup="dialog" onClick={() => void openGeneral()}>Open general chat & history</button></div></div>
      {alerts()}
      {finance && <label className="label mb-4">Financial conversation<select className="input mt-1" value={finance.id} onChange={event => { const chat = ordered.find(item => item.id === event.target.value); if (chat) void openSaved(chat); }}>{ordered.filter(chat => chat.mode === "finance").map(chat => <option key={chat.id} value={chat.id}>Finance · {chat.title} · {chatIdentifier(chat)}</option>)}</select></label>}
      <label className="label my-4 block">Common reports & questions (22)<select className="input mt-1" value="" disabled={creating || !snapshot.loaded} onChange={event => { const report = REPORT_QUESTIONS.find(item => item.id === event.target.value); if (report) { if (finance) setDraft(finance, report.question); else void newChat("finance", report.question); } }}><option value="">Choose a report or question…</option>{REPORT_QUESTIONS.map(report => <option key={report.id} value={report.id}>{report.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Fills the question below. Edit it or press Send. “This month” uses report month {month}. Repeated payments are review candidates, not confirmed subscriptions.</span></label>
      <div className="max-h-[55vh] overflow-y-auto"><Transcript chat={finance} expenses={expenses} onEdit={onEdit} /></div>
      {suggestion && suggestion.id === finance?.id && <div className="my-3 rounded-lg bg-indigo-50 p-3 text-sm"><p>This belongs in General chat. The popup could not open yet; resolve any storage error and retry.</p><button className="btn-secondary mt-2" disabled={creating} onClick={async () => { if (await handoffToGeneral(suggestion.question)) setSuggestion(null); }}>Continue in General chat</button></div>}
      {composer("finance", finance)}
      <p className="mt-3 text-xs text-slate-500">Saved financial answers are dated snapshots. Each new question uses the current records and selected report month. The AI cannot edit expenses.</p>
    </Panel>}
    {popupOpen && <Modal title="Local AI chat · General mode" size="chat" onClose={() => void closePopup()}>
      <div className="flex h-[min(760px,calc(100dvh-9rem))] min-h-0 flex-col gap-3 md:flex-row">
        <button className="btn-secondary shrink-0 md:hidden" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? "Hide conversation history" : "Show conversation history"}</button>
        <div className={`${historyOpen ? "flex flex-1" : "hidden"} min-h-0 flex-col md:flex md:w-64 md:flex-none`}>{sidebar()}</div>
        <section aria-label="General chat conversation" className={`${historyOpen ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col gap-3`}>
          <div className="shrink-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-sm font-semibold">{general?.title || "Your local AI"}</h3><button className="text-xs text-indigo-700 underline" disabled={checking} onClick={() => void checkStatus()}>Check connection</button></div><p className="mt-1 text-xs text-slate-500">General chat · {status?.model || "Checking model…"} · No ledger access or web browsing. Model answers and math can be wrong.</p></div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><Transcript chat={general} live={live?.id === general?.id ? live?.content : undefined} expenses={expenses} onEdit={onEdit} />{alerts()}</div>
          <div className="shrink-0 border-t border-slate-200 pt-3">{composer("general", general)}</div>
        </section>
      </div>
      {contextMenu()}
    </Modal>}
    {deleteTarget && <Modal title="Permanently delete this chat?" onClose={() => { if (!deleting) setDeleteTarget(null); }}>
      <p className="text-sm text-slate-700">Delete <strong>{deleteTarget.title}</strong>?</p>
      <p className="mt-2 text-sm"><strong>{nameOf(deleteTarget.mode)}</strong> · <code className="break-all">{deleteTarget.id}</code></p>
      <p className="mt-3 text-sm text-red-700">This permanently removes this chat, its messages, saved draft and financial answer snapshots from V3. It cannot be undone. Your expenses and other chats are kept. Separate backups and exported files are not changed.</p>
      {snapshot.error && <div className="mt-3"><Notice error>{snapshot.error}</Notice></div>}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" data-initial-focus className="btn-secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>No, keep chat</button><button type="button" className="btn-danger" disabled={deleting || busyId === deleteTarget.id || unsaved?.id === deleteTarget.id} onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Yes, delete permanently"}</button></div>
    </Modal>}
  </>;
}
