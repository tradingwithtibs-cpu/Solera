import type { TickerSymbol, Transaction } from "./types";

/**
 * Average cost per share of what's still held, from the wallet's Solera
 * trade history (average-cost method: sells reduce shares, not the basis).
 * Undefined when no buys were made here.
 */
export function costBasisFromTrades(transactions: Transaction[]): Partial<Record<TickerSymbol, number>> {
  const lots: Partial<Record<TickerSymbol, { shares: number; cost: number }>> = {};
  // Oldest first so sells apply to buys that preceded them.
  for (const t of [...transactions].reverse()) {
    const lot = lots[t.ticker] ?? { shares: 0, cost: 0 };
    if ((t.side ?? "buy") === "buy") {
      lot.shares += t.quantity;
      lot.cost += t.totalValue;
    } else if (lot.shares > 0) {
      const avg = lot.cost / lot.shares;
      const sold = Math.min(t.quantity, lot.shares);
      lot.shares -= sold;
      lot.cost -= sold * avg;
    }
    lots[t.ticker] = lot;
  }
  const basis: Partial<Record<TickerSymbol, number>> = {};
  for (const [ticker, lot] of Object.entries(lots) as [TickerSymbol, { shares: number; cost: number }][]) {
    if (lot.shares > 1e-9) basis[ticker] = lot.cost / lot.shares;
  }
  return basis;
}
