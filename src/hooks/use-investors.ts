"use client";

import { useEffect, useSyncExternalStore } from "react";
import { INVESTORS } from "@/lib/mock-data";
import { walletToInvestor, type WalletHoldings } from "@/lib/investors";
import { getLivePrices, subscribeLivePrices } from "@/lib/live-prices";
import type { Investor } from "@/lib/types";

/**
 * The investors every screen shows. Real wallets from /api/investors once
 * loaded; until then (or if the source is down) the sample investors, who
 * are labelled as samples wherever they appear. Fetched once per page load
 * and shared by every component through a module-level store.
 */
let wallets: WalletHoldings[] | null = null;
let failed = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function load() {
  inFlight ??= fetch("/api/investors")
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { wallets: WalletHoldings[] };
      wallets = data.wallets;
    })
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      inFlight = null;
      notify();
    });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useInvestors(): { investors: Investor[]; isLoaded: boolean; source: "chain" | "sample" } {
  const snapshot = useSyncExternalStore(subscribe, () => wallets, () => null);
  // Performance figures depend on live prices/history, so re-derive when those move.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);

  useEffect(() => {
    if (!wallets && !failed) load();
  }, []);

  if (snapshot && snapshot.length > 0) {
    return { investors: snapshot.map(walletToInvestor), isLoaded: true, source: "chain" };
  }
  return { investors: INVESTORS.map((i) => ({ ...i, kind: "sample" as const })), isLoaded: failed || !!snapshot, source: "sample" };
}

/** One investor by id (wallet address or sample id). */
export function useInvestor(id: string | null | undefined): Investor | undefined {
  const { investors } = useInvestors();
  return id ? investors.find((i) => i.id === id) : undefined;
}
