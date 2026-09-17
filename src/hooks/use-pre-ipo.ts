"use client";

import { useEffect, useState } from "react";
import type { PreIpoToken } from "@/lib/pre-ipo";

const POLL_INTERVAL_MS = 30_000;

export interface PreIpoState {
  tokens: PreIpoToken[];
  sources: { prestocks: boolean; tessera: boolean } | null;
  isLoaded: boolean;
  error: string | null;
}

/** Polls /api/pre-ipo. Keeps the last good list if a refresh fails. */
export function usePreIpo(): PreIpoState {
  const [state, setState] = useState<PreIpoState>({ tokens: [], sources: null, isLoaded: false, error: null });

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/pre-ipo");
        if (!res.ok) throw new Error(`Pre-IPO data unavailable (${res.status})`);
        const data = (await res.json()) as { tokens: PreIpoToken[]; sources: PreIpoState["sources"] };
        if (cancelled) return;
        setState({ tokens: data.tokens, sources: data.sources, isLoaded: true, error: null });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          error: prev.tokens.length ? null : err instanceof Error ? err.message : "Pre-IPO data unavailable",
        }));
      }
    }
    // Network fetch on mount plus a slow poll; setState only runs after the round trip.
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
