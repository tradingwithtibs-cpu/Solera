"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PreIpoToken } from "@/lib/pre-ipo";

const POLL_INTERVAL_MS = 30_000;

export interface PreIpoState {
  tokens: PreIpoToken[];
  sources: { prestocks: boolean; tessera: boolean } | null;
  isLoaded: boolean;
  error: string | null;
}

/**
 * One shared poll of /api/pre-ipo for every component that shows pre-IPO
 * tokens (tape, strip, markets, the pre-IPO page). Keeps the last good list
 * if a refresh fails. Module store, same pattern as use-investors.
 */
let state: PreIpoState = { tokens: [], sources: null, isLoaded: false, error: null };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;

function notify() {
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  inFlight ??= fetch("/api/pre-ipo")
    .then(async (res) => {
      if (!res.ok) throw new Error(`Pre-IPO data unavailable (${res.status})`);
      const data = (await res.json()) as { tokens: PreIpoToken[]; sources: PreIpoState["sources"] };
      state = { tokens: data.tokens, sources: data.sources, isLoaded: true, error: null };
    })
    .catch((err: unknown) => {
      state = {
        ...state,
        isLoaded: true,
        error: state.tokens.length ? null : err instanceof Error ? err.message : "Pre-IPO data unavailable",
      };
    })
    .finally(() => {
      inFlight = null;
      notify();
    });
  return inFlight;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!interval) interval = setInterval(load, POLL_INTERVAL_MS);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

const SERVER_STATE: PreIpoState = { tokens: [], sources: null, isLoaded: false, error: null };

export function usePreIpo(): PreIpoState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => {
    if (!state.isLoaded) load();
  }, []);
  return snapshot;
}

/** The current tokens outside React (palette, tape helpers). */
export function getPreIpoTokens(): PreIpoToken[] {
  return state.tokens;
}
