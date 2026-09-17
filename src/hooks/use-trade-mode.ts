"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { TradeMode } from "@/lib/trade";

const STORAGE_KEY = "solera:trade-mode";

/**
 * The user's chosen mode. Live is the default: connect a wallet and every
 * trade is real. Practice is something you opt into (or what you get with
 * no wallet at all). Stored per browser like the rest of the app's state.
 */
let preferred: TradeMode = "live";
if (typeof window !== "undefined") {
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "practice") preferred = "practice";
  } catch {
    // Storage unavailable — stay on the default.
  }
}
const listeners = new Set<() => void>();

function setPreferred(mode: TradeMode) {
  preferred = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore write failures.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTradeMode() {
  const chosen = useSyncExternalStore(
    subscribe,
    () => preferred,
    () => "live" as TradeMode,
  );
  const { connected } = useWallet();

  // One-time nudge past the SSR value once the client store is readable —
  // same pattern as use-portfolio.ts.
  useEffect(() => {
    listeners.forEach((l) => l());
  }, []);

  const setMode = useCallback((mode: TradeMode) => setPreferred(mode), []);

  /** The mode trades actually run in: live needs a connected wallet. */
  const mode: TradeMode = chosen === "live" && connected ? "live" : "practice";

  return { mode, chosen, setMode, connected, isLive: mode === "live" };
}
