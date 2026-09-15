"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { seedMessagesForRoom } from "@/lib/mock-chat";
import type { ChatMessage, TickerSymbol } from "@/lib/types";

const STORAGE_KEY = "stocklana:chat";

type ChatStore = Partial<Record<TickerSymbol, ChatMessage[]>>;

function readFromStorage(): ChatStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatStore) : {};
  } catch {
    return {};
  }
}

// Module-level store, same pattern as use-portfolio.ts / use-followed-investors.ts.
// `null` means "not yet hydrated from localStorage" — distinct from a room
// that's genuinely never had a message sent in it (which falls back to seed
// data instead of appearing empty).
let snapshot: ChatStore | null = typeof window !== "undefined" ? readFromStorage() : null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): ChatStore | null {
  return null;
}

function persist(next: ChatStore) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
  listeners.forEach((listener) => listener());
}

interface Author {
  name: string;
  initials: string;
  avatarColor: string;
}

function sendMessage(roomId: TickerSymbol, body: string, author: Author) {
  const current = snapshot ?? {};
  const existing = current[roomId] ?? seedMessagesForRoom(roomId);

  const message: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    authorName: author.name,
    authorInitials: author.initials,
    authorColor: author.avatarColor,
    body,
    timestamp: Date.now(),
  };

  persist({ ...current, [roomId]: [...existing, message] });
}

/**
 * Messages for one ticker's demo chat room. Entirely local/mocked — see
 * the architecture note in mock-chat.ts and the conversation that led here:
 * swapping this for a real real-time backend later only means rewriting
 * this file's internals (and adding real user identity), not the screens
 * that consume it.
 */
export function useRoomMessages(roomId: TickerSymbol) {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const messages = store ? (store[roomId] ?? seedMessagesForRoom(roomId)) : null;

  const send = useCallback((body: string, author: Author) => sendMessage(roomId, body, author), [roomId]);

  // One-time nudge past the `null` SSR placeholder to the real value
  // already sitting in `snapshot` — see use-followed-investors.ts.
  useEffect(() => {
    listeners.forEach((listener) => listener());
  }, []);

  return { messages, isLoaded: store !== null, sendMessage: send };
}
