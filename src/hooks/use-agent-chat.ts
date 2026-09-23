"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getStoredSession, useSession } from "./use-session";
import { useTradeMode } from "./use-trade-mode";
import { useSelectedTicker } from "./use-selected-ticker";
import type { AgentCard, AgentModelName, AgentRequest, AgentResponse, PendingDraft } from "@/lib/agent/types";
import type { PlanCondition } from "@/lib/plans";
import { errorCopy, MESSAGE_MAX, THREAD_TURNS, trimTurns } from "@/components/agent/helpers";

/**
 * The Agent tab's thread (docs/port/agent-ux.md §1.4, plan.md §0.17): one
 * conversation per tab in sessionStorage, mirrored to localStorage for 15
 * minutes because iPhone wallet hops come back in a new tab. Cleared on
 * sign-out, on a wallet change and by the panel's "clear". Each assistant
 * turn keeps the whole AgentResponse (reply, cards, trace, model, the
 * pending draft that goes back verbatim on the next send) plus what the
 * person did to its cards, so a reload shows an armed card as armed.
 */
export const THREAD_KEY = "solera:agent-thread";
const MIRROR_MAX_AGE_MS = 15 * 60_000;

export interface CardState {
  status?: "armed" | "discarded";
  planId?: string | null;
  condition?: PlanCondition;
  summary?: string;
  armUntil?: number | null;
}

export interface AgentTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  cards?: AgentCard[];
  toolTrace?: AgentResponse["toolTrace"];
  model?: AgentModelName;
  pendingDraft?: PendingDraft | null;
  /** Keyed by card index. */
  cardState?: Record<string, CardState>;
}

export interface AgentError {
  status: number | null;
  message: string;
}

interface ThreadState {
  turns: AgentTurn[];
  pendingDraft: PendingDraft | null;
  owner: string | null;
}

const EMPTY: ThreadState = { turns: [], pendingDraft: null, owner: null };

function parse(raw: string | null): ThreadState | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<ThreadState>;
    if (!t || !Array.isArray(t.turns)) return null;
    return { turns: t.turns.filter((x) => x && (x.role === "user" || x.role === "assistant") && typeof x.text === "string"), pendingDraft: t.pendingDraft ?? null, owner: typeof t.owner === "string" ? t.owner : null };
  } catch {
    return null;
  }
}

function read(): ThreadState {
  try {
    const own = parse(window.sessionStorage.getItem(THREAD_KEY));
    if (own) return own;
    const mirrored = window.localStorage.getItem(THREAD_KEY);
    if (mirrored) {
      const m = JSON.parse(mirrored) as { at?: number; thread?: ThreadState };
      if (typeof m.at === "number" && Date.now() - m.at < MIRROR_MAX_AGE_MS) {
        const t = parse(JSON.stringify(m.thread ?? null));
        if (t) return t;
      }
    }
  } catch {
    // Storage unavailable: the thread lasts for this page load only.
  }
  return EMPTY;
}

function write(t: ThreadState) {
  try {
    if (t.turns.length === 0) {
      window.sessionStorage.removeItem(THREAD_KEY);
      window.localStorage.removeItem(THREAD_KEY);
      return;
    }
    const raw = JSON.stringify(t);
    window.sessionStorage.setItem(THREAD_KEY, raw);
    window.localStorage.setItem(THREAD_KEY, JSON.stringify({ at: Date.now(), thread: t }));
  } catch {
    // Ignore write failures.
  }
}

let thread: ThreadState = typeof window !== "undefined" ? read() : EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function commit(next: ThreadState) {
  thread = next;
  write(next);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function clearThread() {
  commit(EMPTY);
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
}

export function useAgentChat() {
  const { token, signedIn, owner } = useSession();
  const { mode } = useTradeMode();
  const [ticker] = useSelectedTicker();
  const state = useSyncExternalStore(subscribe, () => thread, () => EMPTY);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<AgentError | null>(null);
  const [model, setModel] = useState<AgentModelName | null>(null);
  const busy = useRef(false);
  const prevOwner = useRef<string | null | undefined>(undefined);

  // Nudge past the server snapshot once the client store is readable (same pattern as use-session).
  useEffect(() => {
    emit();
  }, []);

  // Which model answers here, so the subtitle is right before the first turn.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ model?: string }>) : null))
      .then((d) => {
        if (!cancelled && d && (d.model === "mock" || d.model === "anthropic")) setModel(d.model);
      })
      .catch(() => {
        // The first send reports the error; nothing to label yet.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sign-out or a different owner clears the thread; signing in mid-conversation adopts it.
  useEffect(() => {
    const prev = prevOwner.current;
    prevOwner.current = owner;
    const t = thread;
    if (owner) {
      if (t.owner && t.owner !== owner) clearThread();
      else if (t.owner !== owner && t.turns.length) commit({ ...t, owner });
    } else if (prev) {
      clearThread();
    }
  }, [owner]);

  const run = useCallback(
    async (text: string, reuseLast: boolean) => {
      if (busy.current) return;
      busy.current = true;
      let turns = thread.turns;
      if (!reuseLast) {
        turns = [...turns, { id: uid(), role: "user", text, at: Date.now() }];
        commit({ ...thread, turns, owner: owner ?? thread.owner });
      }
      setError(null);
      setInFlight(true);
      const body: AgentRequest = {
        messages: trimTurns(turns, THREAD_TURNS),
        mode,
        context: { ticker, page: "agent", intent: "chat", pendingDraft: thread.pendingDraft },
      };
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        // Read at call time: a ?q= auto-send can fire before the session store has hydrated.
        const bearer = getStoredSession()?.token ?? token;
        if (bearer) headers.Authorization = `Bearer ${bearer}`;
        const res = await fetch("/api/agent", { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
        if (!res.ok) {
          setError({ status: res.status, message: errorCopy(res.status) });
          return;
        }
        const data = (await res.json()) as AgentResponse;
        const reply: AgentTurn = {
          id: uid(),
          role: "assistant",
          text: typeof data.reply === "string" ? data.reply : "",
          at: Date.now(),
          cards: Array.isArray(data.cards) ? data.cards : [],
          toolTrace: Array.isArray(data.toolTrace) ? data.toolTrace : [],
          model: data.model,
          pendingDraft: data.pendingDraft ?? null,
        };
        if (data.model === "mock" || data.model === "anthropic") setModel(data.model);
        commit({ ...thread, turns: [...thread.turns, reply], pendingDraft: data.pendingDraft ?? null });
      } catch {
        setError({ status: null, message: errorCopy(null) });
      } finally {
        busy.current = false;
        setInFlight(false);
      }
    },
    [mode, ticker, token, owner],
  );

  const send = useCallback(
    (text: string) => {
      const s = text.trim().slice(0, MESSAGE_MAX);
      if (!s) return;
      void run(s, false);
    },
    [run],
  );

  const retry = useCallback(() => {
    const last = thread.turns[thread.turns.length - 1];
    if (!last || last.role !== "user") return;
    void run(last.text, true);
  }, [run]);

  const clear = useCallback(() => {
    clearThread();
    setError(null);
  }, []);

  /** What the person did to a card (armed, discarded, edited), persisted with the turn. */
  const updateCard = useCallback((turnId: string, index: number, patch: CardState) => {
    const turns = thread.turns.map((t) => (t.id === turnId ? { ...t, cardState: { ...(t.cardState ?? {}), [index]: { ...(t.cardState?.[index] ?? {}), ...patch } } } : t));
    commit({ ...thread, turns });
  }, []);

  return {
    turns: state.turns,
    pendingDraft: state.pendingDraft,
    inFlight,
    error,
    model,
    send,
    retry,
    clear,
    updateCard,
    token,
    signedIn,
    mode,
  };
}
