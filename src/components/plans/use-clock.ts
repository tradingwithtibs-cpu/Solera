"use client";

import { useEffect, useSyncExternalStore } from "react";

const TICK_MS = 10_000;

/**
 * The wall clock as a store, ticking every 10 s while a row reads it, so
 * "checked 12 s ago" and "ready since 2 min ago" render without calling
 * Date.now() during render and keep moving while the panel is open.
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
export function useClock(): number | null {
  const value = useSyncExternalStore(subscribe, () => now, () => 0);
  useEffect(() => {
    tick();
  }, []);
  return value || null;
}
