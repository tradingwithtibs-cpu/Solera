import { TICKERS } from "./mock-data";
import { getEffectivePrice } from "./live-prices";
import type { TickerSymbol, TradeSide } from "./types";

export interface TradeParams {
  ticker: TickerSymbol;
  side: TradeSide;
  quantity: number;
}

export interface TradeResult {
  success: true;
  ticker: TickerSymbol;
  side: TradeSide;
  quantity: number;
  pricePerShare: number;
  /** Dollar value of the fill — cost for a buy, proceeds for a sell. */
  totalValue: number;
  /** Fake transaction reference, standing in for a Solana signature. */
  txId: string;
  timestamp: number;
}

/**
 * Executes a buy or sell.
 *
 * ⚠️ MOCK IMPLEMENTATION. This is the single seam meant to be swapped out
 * for a real trade: today it just waits a bit and returns a fabricated
 * fill at the current mock price. A teammate will replace the body of this
 * function with a real Solana / Jupiter swap call (build tx -> sign ->
 * send -> confirm) — a real swap naturally handles both directions through
 * one function too, just with the input/output mint order flipped for a
 * sell — and return an equivalent `TradeResult`.
 *
 * Nothing outside this file should need to change when that happens —
 * every screen goes through `executeTrade()` (or the `useExecuteTrade`
 * hook that wraps it) rather than talking to a wallet or RPC directly.
 */
export async function executeTrade({ ticker, side, quantity }: TradeParams): Promise<TradeResult> {
  if (
    !Object.hasOwn(TICKERS, ticker) ||
    !["buy", "sell"].includes(side) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  )
    throw new Error("Enter a valid order amount.");
  // Simulated network/confirmation latency.
  await new Promise((resolve) => setTimeout(resolve, 1400));

  // Fetched at settlement time, not when the order screen first rendered —
  // for AAPLx/AMZNx (the two tickers with a real live price behind them,
  // see lib/live-prices.ts) this is the freshest real price we have.
  const pricePerShare = getEffectivePrice(ticker);

  return {
    success: true,
    ticker,
    side,
    quantity,
    pricePerShare,
    totalValue: pricePerShare * quantity,
    txId: `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    timestamp: Date.now(),
  };
}
