import type { QueryResponse } from "./ai/types";
import type { ChatTurn } from "./ai/conversation";
import { isObject } from "./ai/validation";
import { serverChatPlatform } from "./chat-platform";

export type ChatMode = "finance" | "general";
export interface SavedMessage {
  id: string; role: "user" | "assistant"; content: string; at: number;
  status: "complete" | "failed" | "stopped";
  result?: QueryResponse;
  month?: string;
}
export interface Conversation {
  id: string; mode: ChatMode; title: string; draft: string; updatedAt: number; messages: SavedMessage[];
}
export interface ChatArchive { schema: 1; conversations: Conversation[] }
export interface ChatSnapshot { archive: ChatArchive; loaded: boolean; error: string | null; warning?: string | null }
export interface ChatPlatform { read(): Promise<string | null>; write(raw: string, expected: string | null): Promise<void>; remove?(id: string, expectedUpdatedAt: number): Promise<void>; warning?(): string | null; subscribe(listener: () => void): () => void }
export const CHAT_MAX_BYTES = 24 * 1024 * 1024;
const EMPTY: ChatSnapshot = { archive: { schema: 1, conversations: [] }, loaded: false, error: null };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Chat history could not be saved.";

export function parseChatArchive(raw: string): ChatArchive {
  const invalid = () => { throw new Error("Saved chat history is invalid. Existing history has not been overwritten."); };
  if (new TextEncoder().encode(raw).length > CHAT_MAX_BYTES) return invalid();
  const value: unknown = JSON.parse(raw);
  if (!isObject(value) || value.schema !== 1 || !Array.isArray(value.conversations) || value.conversations.length > 50) return invalid();
  const ids = new Set<string>();
  for (const chat of value.conversations) {
    if (!isObject(chat) || typeof chat.id !== "string" || !chat.id || chat.id.length > 100 || ids.has(chat.id) || !["finance", "general"].includes(String(chat.mode)) || typeof chat.title !== "string" || chat.title.length > 100 || typeof chat.draft !== "string" || chat.draft.length > 4000 || typeof chat.updatedAt !== "number" || !Number.isFinite(chat.updatedAt) || !Array.isArray(chat.messages) || chat.messages.length > 200) return invalid();
    ids.add(chat.id);
    const messageIds = new Set<string>();
    for (const message of chat.messages) {
      if (!isObject(message) || typeof message.id !== "string" || message.id.length > 100 || messageIds.has(message.id) || !["user", "assistant"].includes(String(message.role)) || typeof message.content !== "string" || message.content.length > 24_000 || typeof message.at !== "number" || !Number.isFinite(message.at) || !["complete", "failed", "stopped"].includes(String(message.status))) return invalid();
      messageIds.add(message.id);
      if (message.result !== undefined) {
        // Finance evidence is an app-produced snapshot, never model conversation input.
        const result = message.result;
        if (chat.mode !== "finance" || message.role !== "assistant" || !isObject(result) || typeof result.answer !== "string" || typeof result.model !== "string" || !Array.isArray(result.expenseIds) || !isObject(result.evidence) || !isObject(result.evidence.period) || typeof result.evidence.period.from !== "string" || typeof result.evidence.period.to !== "string" || !isObject(result.evidence.filters) || !Array.isArray(result.evidence.matches) || !Array.isArray(result.evidence.categories) || !Array.isArray(result.evidence.merchants) || !Array.isArray(result.evidence.recurring) || !Number.isSafeInteger(result.evidence.totalCents) || !Number.isSafeInteger(result.evidence.count) || typeof message.month !== "string") return invalid();
      }
    }
  }
  return value as unknown as ChatArchive;
}

/** Only successful exchanges in this selected chat become general model context. */
export function completedChatTurns(chat: Conversation): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let index = 0; index < chat.messages.length - 1; index++) {
    const user = chat.messages[index], answer = chat.messages[index + 1];
    if (user.role === "user" && answer.role === "assistant" && answer.status === "complete") {
      turns.push({ role: "user", content: user.content }, { role: "assistant", content: answer.content });
      index++;
    }
  }
  return turns;
}

export function createChatStore(platform?: ChatPlatform) {
  let snapshot = EMPTY;
  let raw: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let loadPromise: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const fail = (error: unknown) => { snapshot = { ...snapshot, loaded: true, error: errorText(error) }; emit(); };
  async function refresh() {
    if (!platform) return;
    const next = await platform.read();
    if (!snapshot.loaded || next !== raw || snapshot.error || (snapshot.warning ?? null) !== (platform.warning?.() ?? null)) {
      const archive = next === null ? { schema: 1 as const, conversations: [] } : parseChatArchive(next);
      raw = next; snapshot = { archive, loaded: true, error: null, warning: platform.warning?.() ?? null }; emit();
    }
  }
  async function mutate(change: (archive: ChatArchive) => void): Promise<boolean> {
    const task = queue.then(async () => {
      if (!platform) throw new Error("Chat storage is unavailable.");
      const expected = await platform.read();
      const archive = expected === null ? { schema: 1 as const, conversations: [] } : parseChatArchive(expected);
      change(archive);
      const next = JSON.stringify(archive);
      if (new TextEncoder().encode(next).length > CHAT_MAX_BYTES) throw new Error("Chat history is full. Export and delete older conversations before continuing.");
      parseChatArchive(next);
      await platform.write(next, expected);
      raw = next; snapshot = { archive, loaded: true, error: null, warning: platform.warning?.() ?? null }; emit();
      return true;
    }).catch(error => { fail(error); return false; });
    queue = task;
    return task;
  }
  return {
    getSnapshot: () => snapshot, getServerSnapshot: () => EMPTY,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load() {
      if (!loadPromise) {
        platform?.subscribe(() => { queue = queue.then(refresh).catch(fail); });
        loadPromise = refresh().catch(fail);
      }
      return loadPromise;
    },
    async reload() { queue = queue.then(refresh).catch(fail); await queue; },
    async create(mode: ChatMode, initialDraft = ""): Promise<string | null> {
      const id = crypto.randomUUID();
      const ok = await mutate(archive => {
        if (archive.conversations.length >= 50) throw new Error("You have 50 conversations. Export and delete an older chat before starting another.");
        archive.conversations.push({ id, mode, title: initialDraft.trim() ? initialDraft.trim().replace(/\s+/g, " ").slice(0, 80) : mode === "finance" ? "New financial conversation" : "New general conversation", draft: initialDraft, updatedAt: Date.now(), messages: [] });
      });
      return ok ? id : null;
    },
    update(id: string, change: (chat: Conversation) => void) {
      return mutate(archive => {
        const chat = archive.conversations.find(item => item.id === id);
        if (!chat) throw new Error("This conversation was removed. Open another conversation.");
        change(chat); chat.updatedAt = Date.now();
      });
    },
    remove(id: string, expectedUpdatedAt?: number) {
      if (!platform?.remove) return mutate(archive => { archive.conversations = archive.conversations.filter(chat => chat.id !== id); });
      const task = queue.then(async () => {
        const current = await platform.read();
        const archive = current === null ? { schema: 1 as const, conversations: [] } : parseChatArchive(current);
        const chat = archive.conversations.find(item => item.id === id);
        if (chat) await platform.remove!(id, expectedUpdatedAt ?? chat.updatedAt);
        await refresh();
        return true;
      }).catch(error => { fail(error); return false; });
      queue = task;
      return task;
    },
  };
}

export const chatStore = createChatStore(typeof window === "undefined" ? undefined : serverChatPlatform());
