"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// Chats and saved prompts live in this browser only (localStorage); the API keeps nothing.

export type AgentMessage = { role: "user" | "assistant"; content: string; error?: boolean; at: number };
export type AgentChat = { id: string; title: string; updatedAt: number; messages: AgentMessage[] };
export type SavedPrompt = { id: string; title: string; text: string };

const CHATS_KEY = "seidar.agent.chats";
const PROMPTS_KEY = "seidar.agent.prompts";
const MAX_CHATS = 30;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const titleFrom = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || "New chat";
};

const ERRORS: Record<string, string> = {
  "agent-not-configured": "The agent isn't connected yet: the API has no ANTHROPIC_API_KEY set.",
};

/** Chat sessions with the Seidar Agent, for the given wallet context. */
export function useAgentChats(wallet: string | null, wallets: string[]) {
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ctx = useRef({ wallet, wallets });
  ctx.current = { wallet, wallets };

  useEffect(() => {
    const stored = load<AgentChat[]>(CHATS_KEY, []);
    setChats(stored);
    setActiveId(stored[0]?.id ?? null);
  }, []);

  const persist = useCallback((next: AgentChat[]) => {
    const trimmed = [...next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
    save(CHATS_KEY, trimmed);
    return trimmed;
  }, []);

  const active = chats.find((c) => c.id === activeId) ?? null;

  const newChat = useCallback(() => setActiveId(null), []);
  const selectChat = useCallback((id: string) => setActiveId(id), []);
  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => persist(prev.filter((c) => c.id !== id)));
      setActiveId((cur) => (cur === id ? null : cur));
    },
    [persist],
  );

  const send = useCallback(
    /** `from`: continue this chat instead of the open one; "new" starts a fresh chat. */
    async (text: string, from?: AgentChat | "new") => {
      const content = text.trim();
      if (!content || sending) return;
      const now = Date.now();
      const userMsg: AgentMessage = { role: "user", content, at: now };
      const base = from === "new" ? undefined : (from ?? chats.find((c) => c.id === activeId));
      const chat: AgentChat = base
        ? { ...base, updatedAt: now, messages: [...base.messages, userMsg] }
        : { id: newId(), title: titleFrom(content), updatedAt: now, messages: [userMsg] };
      setChats((prev) => persist([chat, ...prev.filter((c) => c.id !== chat.id)]));
      setActiveId(chat.id);
      setSending(true);

      let reply: AgentMessage;
      try {
        const r = await apiFetch("/api/agent/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wallet: ctx.current.wallet,
            wallets: ctx.current.wallets,
            // Failed turns are shown to the user but not sent back to the model.
            messages: chat.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; reply?: string; error?: string } | null;
        reply = j?.ok && j.reply
          ? { role: "assistant", content: j.reply, at: Date.now() }
          : { role: "assistant", content: ERRORS[j?.error ?? ""] ?? j?.error ?? `The agent didn't answer (HTTP ${r.status}).`, error: true, at: Date.now() };
      } catch {
        reply = { role: "assistant", content: "Couldn't reach the Seidar API. Check your connection and try again.", error: true, at: Date.now() };
      }
      setChats((prev) => {
        const cur = prev.find((c) => c.id === chat.id) ?? chat;
        return persist([{ ...cur, updatedAt: Date.now(), messages: [...cur.messages, reply] }, ...prev.filter((c) => c.id !== chat.id)]);
      });
      setSending(false);
    },
    [activeId, chats, persist, sending],
  );

  /** Re-send the last user message of the open chat (after a failed answer). */
  const retry = useCallback(() => {
    if (!active || sending) return;
    const lastUser = [...active.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Drop the failed exchange and ask again from the chat as it was before it.
    void send(lastUser.content, { ...active, messages: active.messages.slice(0, active.messages.lastIndexOf(lastUser)) });
  }, [active, send, sending]);

  return { chats, active, sending, send, newChat, selectChat, deleteChat, retry };
}

/** One-click prompts saved in this browser. */
export function useSavedPrompts() {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  useEffect(() => setPrompts(load<SavedPrompt[]>(PROMPTS_KEY, [])), []);
  const write = useCallback((next: SavedPrompt[]) => {
    save(PROMPTS_KEY, next);
    setPrompts(next);
  }, []);
  const upsert = useCallback(
    (p: Omit<SavedPrompt, "id"> & { id?: string }) => {
      const item: SavedPrompt = { id: p.id ?? newId(), title: p.title.trim() || titleFrom(p.text), text: p.text.trim() };
      write(p.id ? prompts.map((x) => (x.id === p.id ? item : x)) : [item, ...prompts]);
    },
    [prompts, write],
  );
  const remove = useCallback((id: string) => write(prompts.filter((p) => p.id !== id)), [prompts, write]);
  return { prompts, upsert, remove };
}
