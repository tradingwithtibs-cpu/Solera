"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PublicFill } from "@/lib/fills";
import type { ChatMessage } from "@/lib/types";
import { requestProfiles } from "./use-profiles";

/**
 * Read-only chat and on-chain activity for the Discover tabs, polled while
 * something on the page reads them:
 *
 * - useRoomsMessages(rooms)   the latest posts across several ticker rooms (Holdings).
 * - useAuthorsMessages(owners) the latest posts by the people you follow (Following).
 * - useFollowedActivity(wallets) their on-chain stock swaps from /api/activity (Following).
 *
 * One module cache per query string; a tab switch never refetches inside
 * the TTL. Posting still goes through useRoomMessages (one room, live).
 */
interface Entry<T> {
  items: T[];
  isLoaded: boolean;
  error: string | null;
  at: number;
}

const CHAT_POLL_MS = 10_000;
const ACTIVITY_POLL_MS = 60_000;

function makeStore<T>(path: string, pollMs: number, pick: (data: unknown) => T[], onItems?: (items: T[]) => void) {
  let entries: Record<string, Entry<T>> = {};
  const inflight = new Set<string>();
  const listeners = new Set<() => void>();
  const readers = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const EMPTY: Entry<T> = { items: [], isLoaded: false, error: null, at: 0 };

  const notify = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };

  function load(query: string) {
    if (inflight.has(query)) return;
    inflight.add(query);
    fetch(`${path}${query}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `Unavailable (${res.status})`);
        const items = pick(data);
        onItems?.(items);
        entries = { ...entries, [query]: { items, isLoaded: true, error: null, at: Date.now() } };
      })
      .catch((err: unknown) => {
        const previous = entries[query];
        entries = { ...entries, [query]: { items: previous?.items ?? [], isLoaded: true, error: err instanceof Error ? err.message : "Unavailable", at: Date.now() } };
      })
      .finally(() => {
        inflight.delete(query);
        notify();
        if ((readers.get(query) ?? 0) > 0) schedule(query);
      });
  }

  function schedule(query: string) {
    const existing = timers.get(query);
    if (existing) clearTimeout(existing);
    timers.set(
      query,
      setTimeout(() => {
        timers.delete(query);
        if ((readers.get(query) ?? 0) > 0 && document.visibilityState === "visible") load(query);
        else if ((readers.get(query) ?? 0) > 0) schedule(query);
      }, pollMs),
    );
  }

  function start(query: string) {
    readers.set(query, (readers.get(query) ?? 0) + 1);
    const current = entries[query];
    if (!current?.isLoaded || Date.now() - current.at > pollMs) load(query);
    else schedule(query);
  }

  function stop(query: string) {
    const n = Math.max(0, (readers.get(query) ?? 1) - 1);
    readers.set(query, n);
    if (n === 0) {
      const t = timers.get(query);
      if (t) clearTimeout(t);
      timers.delete(query);
    }
  }

  function use(query: string | null): Entry<T> {
    const snapshot = useSyncExternalStore(subscribe, () => entries, () => entries);
    useEffect(() => {
      if (query === null) return;
      start(query);
      return () => stop(query);
    }, [query]);
    if (query === null) return { ...EMPTY, isLoaded: true };
    return snapshot[query] ?? EMPTY;
  }

  return { use, refresh: load };
}

const rooms = makeStore<ChatMessage>(
  "/api/chat",
  CHAT_POLL_MS,
  (d) => ((d as { messages?: ChatMessage[] }).messages ?? []),
  (items) => requestProfiles(items.map((m) => m.author)),
);
const activity = makeStore<PublicFill>("/api/activity", ACTIVITY_POLL_MS, (d) => ((d as { fills?: PublicFill[] }).fills ?? []));

function listQuery(param: string, values: string[]): string | null {
  const unique = [...new Set(values.filter(Boolean))].sort();
  return unique.length === 0 ? null : `?${param}=${encodeURIComponent(unique.join(","))}`;
}

/** Latest messages across `roomIds`, newest first; loaded immediately (and empty) when there are no rooms. */
export function useRoomsMessages(roomIds: string[]): { messages: ChatMessage[]; isLoaded: boolean; error: string | null } {
  const entry = rooms.use(listQuery("rooms", roomIds));
  return { messages: entry.items, isLoaded: entry.isLoaded, error: entry.error };
}

/** Latest messages by `owners` (owner strings or wallet addresses), newest first. */
export function useAuthorsMessages(owners: string[]): { messages: ChatMessage[]; isLoaded: boolean; error: string | null } {
  const entry = rooms.use(listQuery("authors", owners));
  return { messages: entry.items, isLoaded: entry.isLoaded, error: entry.error };
}

/** Recent on-chain stock swaps by `wallets`, newest first, as public fills. */
export function useFollowedActivity(wallets: string[]): { fills: PublicFill[]; isLoaded: boolean; error: string | null } {
  const entry = activity.use(listQuery("wallets", wallets));
  return { fills: entry.items, isLoaded: entry.isLoaded, error: entry.error };
}
