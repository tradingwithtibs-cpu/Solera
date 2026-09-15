"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { TickerSymbol } from "@/lib/types";

const STORAGE_KEY = "stocklana:watchlist";

function readFromStorage(): Set<TickerSymbol> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as TickerSymbol[]) : new Set();
  } catch {
    return new Set();
  }
}

// Module-level store shared by every WatchlistButton on the page — same
// pattern as use-followed-investors.ts.
let snapshot: Set<TickerSymbol> = typeof window !== "undefined" ? readFromStorage() : new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

// Stable, always-empty placeholder for the server (and the client's first
// hydration pass) — see the matching comment in use-followed-investors.ts
// for why this needs an explicit post-mount nudge to ever move past it.
const serverSnapshot = new Set<TickerSymbol>();

function getServerSnapshot() {
  return serverSnapshot;
}

function toggleWatch(ticker: TickerSymbol) {
  const next = new Set(snapshot);
  if (next.has(ticker)) {
    next.delete(ticker);
  } else {
    next.add(ticker);
  }
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
  listeners.forEach((listener) => listener());
}

/** Local-only watchlist, persisted per-browser. Purely a UI affordance — no backend. */
export function useWatchlist() {
  const watched = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isWatched = useCallback((ticker: TickerSymbol) => watched.has(ticker), [watched]);

  // One-time nudge past the SSR-safe placeholder to the real value that's
  // already sitting in `snapshot` — see use-followed-investors.ts.
  useEffect(() => {
    listeners.forEach((listener) => listener());
  }, []);

  return { watched, isWatched, toggleWatch };
}
