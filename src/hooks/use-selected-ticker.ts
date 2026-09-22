"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const KEY = "solera:selected-ticker";
const DEFAULT = "TSLAx";

/**
 * The ticker the phone's Trade tab opens and the markets grid selects by
 * default. Set whenever a market row is opened; per browser.
 */
let selected: string = DEFAULT;
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && /^[A-Z0-9.\-]{1,12}x?$/.test(raw)) selected = raw;
  } catch {
    // Storage unavailable — keep the default.
  }
}
const listeners = new Set<() => void>();

export function setSelectedTicker(symbol: string) {
  selected = symbol;
  try {
    window.localStorage.setItem(KEY, symbol);
  } catch {
    // Ignore write failures.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSelectedTicker(): [string, (symbol: string) => void] {
  const value = useSyncExternalStore(subscribe, () => selected, () => DEFAULT);
  useEffect(() => {
    listeners.forEach((l) => l());
  }, []);
  const set = useCallback((symbol: string) => setSelectedTicker(symbol), []);
  return [value, set];
}
