import { VersionedTransaction } from "@solana/web3.js";
import { TICKERS } from "./mock-data";
import { getEffectivePrice, getSolPrice } from "./live-prices";
import { executeUltraOrder, getUltraOrder } from "./jupiter";
import { SETTLEMENT, XSTOCK_TOKENS, fromBaseUnits, toBaseUnits, type SettlementCurrency } from "./tokens";
import type { TickerSymbol, TradeSide } from "./types";

export type TradeMode = "live" | "practice";

export interface TradeParams {
  ticker: TickerSymbol;
  side: TradeSide;
  /** Shares. For a buy this is the estimate shown on screen; a live fill reports the real number. */
  quantity: number;
  /** Dollar amount. For a live buy this is how much is spent (converted to SOL at the current price if paying in SOL). */
  totalValue: number;
  /** What a live trade is paid in (buy) or paid out in (sell). Defaults to SOL. */
  payWith?: SettlementCurrency;
}

/** What a live trade needs from the connected wallet. Matches wallet-adapter's shape. */
export interface TradeWallet {
  publicKey: { toBase58(): string };
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

export interface TradeResult {
  success: true;
  mode: TradeMode;
  ticker: TickerSymbol;
  side: TradeSide;
  quantity: number;
  pricePerShare: number;
  /** Dollar value of the fill — cost for a buy, proceeds for a sell. */
  totalValue: number;
  /** Solana transaction signature for a live trade; a fabricated reference in practice mode. */
  txId: string;
  timestamp: number;
  /** Live only: the currency that was actually spent or received, and how much of it. */
  settledIn?: SettlementCurrency;
  settledAmount?: number;
}

function validate({ ticker, side, quantity, totalValue }: TradeParams) {
  if (
    !Object.hasOwn(TICKERS, ticker) ||
    !["buy", "sell"].includes(side) ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(totalValue) ||
    totalValue <= 0
  )
    throw new Error("Enter a valid order amount.");
}

/**
 * Executes a buy or sell. Two modes behind one function, so every screen
 * goes through here (or the `useExecuteTrade` hook that wraps it) rather
 * than talking to a wallet or Jupiter directly:
 *
 * - `live`: a real swap on Solana mainnet through Jupiter Ultra. SOL (or
 *   USDC) → the xStock for a buy, the xStock → SOL (or USDC) for a sell.
 *   The user's wallet signs; nothing here ever holds a key. The returned
 *   fill is what actually landed on-chain, not the estimate.
 * - `practice`: a simulated fill at the current price after a short delay.
 *   No wallet involved.
 */
export async function executeTrade(params: TradeParams, wallet?: TradeWallet): Promise<TradeResult> {
  validate(params);
  return wallet ? executeLiveTrade(params, wallet) : executePracticeTrade(params);
}

async function executePracticeTrade({ ticker, side, quantity }: TradeParams): Promise<TradeResult> {
  // Simulated network/confirmation latency.
  await new Promise((resolve) => setTimeout(resolve, 1400));
  const pricePerShare = getEffectivePrice(ticker);
  return {
    success: true,
    mode: "practice",
    ticker,
    side,
    quantity,
    pricePerShare,
    totalValue: pricePerShare * quantity,
    txId: `PRACTICE${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    timestamp: Date.now(),
  };
}

async function executeLiveTrade(
  { ticker, side, quantity, totalValue, payWith = "SOL" }: TradeParams,
  wallet: TradeWallet,
): Promise<TradeResult> {
  const token = XSTOCK_TOKENS[ticker];
  const settle = SETTLEMENT[payWith];
  const isBuy = side === "buy";
  const input = isBuy ? settle : token;
  const output = isBuy ? token : settle;

  // A buy is sized in dollars on screen; convert to the settlement currency.
  const solUsd = getSolPrice();
  if (payWith === "SOL" && !solUsd) throw new Error("SOL price unavailable right now. Try again in a moment.");
  const settleUnitsPerDollar = payWith === "SOL" ? 1 / solUsd! : 1;
  const amount = isBuy
    ? toBaseUnits(totalValue * settleUnitsPerDollar, settle.decimals)
    : toBaseUnits(quantity, token.decimals);
  if (amount === "0") throw new Error("That amount is too small to trade.");

  const order = await getUltraOrder({
    inputMint: input.mint,
    outputMint: output.mint,
    amount,
    taker: wallet.publicKey.toBase58(),
  });
  if (!order.transaction) {
    throw new Error(`Jupiter could not build a transaction for this order. Check your ${payWith} balance.`);
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  const signed = await wallet.signTransaction(tx);
  const signedBase64 = Buffer.from(signed.serialize()).toString("base64");

  const result = await executeUltraOrder(signedBase64, order.requestId);
  if (result.status !== "Success" || !result.signature) {
    throw new Error(result.error ? `Swap failed: ${result.error}` : "Swap failed. Nothing was spent.");
  }

  // Prefer the amounts that actually landed; fall back to the order's quote.
  const inUnits = result.inputAmountResult ?? order.inAmount;
  const outUnits = result.outputAmountResult ?? order.outAmount;
  const shares = fromBaseUnits(isBuy ? outUnits : inUnits, token.decimals);
  const settledAmount = fromBaseUnits(isBuy ? inUnits : outUnits, settle.decimals);
  // Dollar value: Jupiter's own USD valuation of the leg when it gives one,
  // otherwise the settlement amount at the price we sized against.
  const jupiterUsd = isBuy ? order.inUsdValue : order.outUsdValue;
  const dollars =
    typeof jupiterUsd === "number" && jupiterUsd > 0 ? jupiterUsd : settledAmount / settleUnitsPerDollar;

  return {
    success: true,
    mode: "live",
    ticker,
    side,
    quantity: shares,
    pricePerShare: shares > 0 ? dollars / shares : 0,
    totalValue: dollars,
    txId: result.signature,
    timestamp: Date.now(),
    settledIn: payWith,
    settledAmount,
  };
}
