import { getCatalog } from "../catalog-server";
import { TICKERS } from "../mock-data";
import { loadNews } from "../news-server";
import { makeResolver } from "../plan-parser";
import { createPlan, getPlan, listPlans, transitionPlan } from "../plans-server";
import { loadLivePrices } from "../live-prices-server";
import { jupiterPricesForMints, mintForTicker } from "../prices-server";
import { XSTOCK_TOKENS } from "../tokens";
import type { TickerSymbol } from "../types";
import type { ToolDeps } from "./types";

/** The tools' real dependencies: Jupiter prices, the news loaders, the catalog, and the plans store. */
export function realDeps(): ToolDeps {
  return {
    prices: async (tickers) => {
      const pairs = await Promise.all(tickers.map(async (t) => [t, (await mintForTicker(t))?.mint] as const));
      const known = pairs.filter((p): p is readonly [string, string] => !!p[1]);
      const byMint = await jupiterPricesForMints(known.map((p) => p[1]));
      const prices: Record<string, number> = {};
      for (const [ticker, mint] of known) if (byMint[mint]) prices[ticker] = byMint[mint];
      // The Pyth reference for whichever of these are featured tickers; a feed outage just leaves it out.
      const underlying: NonNullable<Awaited<ReturnType<ToolDeps["prices"]>>["underlying"]> = {};
      const live = await loadLivePrices().catch(() => null);
      for (const ticker of tickers) {
        const q = live?.underlying[ticker as TickerSymbol];
        if (q) underlying[ticker] = q;
      }
      return { prices, fetchedAt: Date.now(), underlying };
    },
    news: (q) => loadNews(q.ticker ? { ticker: q.ticker } : q.company ? { company: q.company } : {}),
    catalog: () => getCatalog(),
    isTradable: async (ticker) => (await mintForTicker(ticker)) !== null,
    createPlan: (input) => createPlan(input).then((r) => r.plan),
    listPlans: (owner) => listPlans(owner),
    getPlan: (id, owner) => getPlan(id, owner),
    cancelPlan: (plan) => transitionPlan(plan, "cancelled"),
  };
}

/** Featured tickers, their company names, and the catalog (when it answers in time). */
export async function tickerResolver(): Promise<(word: string) => TickerSymbol | undefined> {
  const entries = [
    ...Object.keys(XSTOCK_TOKENS).map((symbol) => ({ symbol, name: (TICKERS as Record<string, { name?: string }>)[symbol]?.name })),
    ...(await Promise.race([getCatalog(), new Promise<[]>((r) => setTimeout(() => r([]), 2_500))]).catch(() => [])).map((t) => ({ symbol: t.symbol, name: t.name })),
  ];
  return makeResolver(entries);
}
