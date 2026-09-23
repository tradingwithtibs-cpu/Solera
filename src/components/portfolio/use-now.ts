"use client";

import { useEffect, useSyncExternalStore } from "react";

const TICK_MS = 30_000;

/**
 * The wall clock as a store, ticking every 30 s while something reads it.
 * Lets the greeting and the "since" relative times render without calling
 * Date.now() during render, and refresh as minutes pass.
 */
let now = typeof window !== "undefined" ? Date.now() : 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) timer = setInterval(tick, TICK_MS);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Unix ms, or null during server render and the hydration pass. */
export function useNow(): number | null {
  const value = useSyncExternalStore(subscribe, () => now, () => 0);
  useEffect(() => {
    tick();
  }, []);
  return value || null;
}
