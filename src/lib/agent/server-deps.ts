import { getCatalog } from "../catalog-server";
import { TICKERS } from "../mock-data";
import { loadNews } from "../news-server";
import { makeResolver } from "../plan-parser";
import { createPlan, getPlan, listPlans, transitionPlan } from "../plans-server";
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
      return { prices, fetchedAt: Date.now() };
    },
    news: (q) => loadNews(q.ticker ? { ticker: q.ticker } : q.company ? { company: q.company } : {}),
    catalog: () => getCatalog(),
    isTradable: async (ticker) => (await mintForTicker(ticker)) !== null,
    createPlan: (input) => createPlan(input),
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
