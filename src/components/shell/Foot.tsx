"use client";

import { useSyncExternalStore } from "react";
import { getLivePrices, subscribeLivePrices } from "@/lib/live-prices";
import { usePreIpo } from "@/hooks/use-pre-ipo";

/** The honest footer: where prices come from, how many, when, and who issues the tokens. */
export function Foot() {
  const live = useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const { tokens } = usePreIpo();
  const priced = Object.keys(live.prices).length + tokens.filter((t) => t.tokenPrice > 0).length;
  const refreshed = live.fetchedAt ? new Date(live.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  return (
    <footer className="foot">
      prices live via Jupiter Price v3 · {priced} tokens · underlying via Pyth · refreshed {refreshed} · issued by xStocks (Backed),
      PreStocks and Tessera, not by Solera · not financial advice
    </footer>
  );
}
