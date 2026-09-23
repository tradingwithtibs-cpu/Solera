"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PublicFill } from "@/lib/fills";

/**
 * The public tape: every fill posted to Solera, newest first, from
 * GET /api/tape. One module store shared by the feed and the trending
 * card, polled every 30 s while anything on the page reads it.
 */
interface TapeState {
  fills: PublicFill[];
  isLoaded: boolean;
  /** False when the deployment has no fills tables yet. */
  configured: boolean | null;
  error: string | null;
}

const POLL_MS = 30_000;
const LIMIT = 80;

let state: TapeState = { fills: [], isLoaded: false, configured: null, error: null };
const listeners = new Set<() => void>();
let readers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function fetchTape(): Promise<void> {
  inflight ??= fetch(`/api/tape?limit=${LIMIT}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`The tape is unavailable (${res.status}).`);
      const data = (await res.json()) as { fills: PublicFill[]; configured?: boolean; error?: string };
      if (data.error) throw new Error(data.error);
      state = { fills: data.fills ?? [], isLoaded: true, configured: data.configured ?? true, error: null };
    })
    .catch((err: unknown) => {
      state = { ...state, isLoaded: true, error: err instanceof Error ? err.message : "The tape is unavailable." };
    })
    .finally(() => {
      inflight = null;
      notify();
    });
  return inflight;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (readers === 0) return;
    void fetchTape().then(schedule);
  }, POLL_MS);
}

function start() {
  readers += 1;
  if (readers === 1) {
    void fetchTape().then(schedule);
  }
}

function stop() {
  readers = Math.max(0, readers - 1);
  if (readers === 0 && timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Ask for a fresh tape now (after the user's own fill lands, for instance). */
export function refreshTape(): Promise<void> {
  return fetchTape();
}

export function useTape(): TapeState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    start();
    return stop;
  }, []);
  return snapshot;
}

/**
 * One owner's public fills (both modes) from GET /api/fills?owner=, for the
 * "Mine" tab when signed in. Refetched whenever the tape refreshes so a
 * new fill shows up within the same poll.
 */
export function useOwnerFills(owner: string | null): { fills: PublicFill[]; isLoaded: boolean } {
  const [result, setResult] = useState<{ owner: string | null; fills: PublicFill[] }>({ owner: null, fills: [] });
  const tape = useTape();
  const tapeVersion = tape.fills.length ? tape.fills[0].createdAt : 0;
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    fetch(`/api/fills?owner=${encodeURIComponent(owner)}&limit=60`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { fills: PublicFill[] };
        if (!cancelled) setResult({ owner, fills: data.fills ?? [] });
      })
      .catch(() => {
        if (!cancelled) setResult({ owner, fills: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, tapeVersion]);
  if (!owner) return { fills: [], isLoaded: true };
  return { fills: result.owner === owner ? result.fills : [], isLoaded: result.owner === owner };
}
