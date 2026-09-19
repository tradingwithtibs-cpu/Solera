import { VersionedTransaction } from "@solana/web3.js";
import { getTokenForSymbol, isKnownTicker } from "./catalog";
import { getEffectivePrice, getSolPrice } from "./live-prices";
import { executeUltraOrder, getUltraOrder } from "./jupiter";
import { SETTLEMENT, fromBaseUnits, toBaseUnits, type SettlementCurrency } from "./tokens";
import { stageContinuation, type Continuation } from "./deferred-signing";
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
  /** Set when the order came from "Copy" on an investor's holding; recorded with the trade. */
  copiedFromInvestorId?: string;
}

/** What a live trade needs from the connected wallet. Matches wallet-adapter's shape. */
export interface TradeWallet {
  publicKey: { toBase58(): string };
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  /**
   * True for a wallet that signs by leaving the page (Phantom deeplinks on
   * iOS Safari). The swap then finishes on the return page load via
   * `finishDeferredSwap`, so the trade context is staged before signing.
   */
  deferred?: boolean;
}

/** What a swap is for, so a deferred one can be finished and recorded later. */
export type SwapContext = { payWith: SettlementCurrency; trade: Extract<Continuation, { kind: "swap" }>["trade"] };

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
    !isKnownTicker(ticker) ||
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

export interface SwapFill {
  signature: string;
  /** Base units actually moved, as reported by Jupiter once landed. */
  inUnits: string;
  outUnits: string;
  /** Jupiter's USD valuation of the input/output legs at order time, when given. */
  inUsd?: number;
  outUsd?: number;
}

/**
 * The one place a real swap happens: build the order with Jupiter Ultra,
 * have the wallet sign, submit. Used by xStock trades and pre-IPO buys
 * alike. Throws on any failure; a thrown error means nothing was spent.
 */
export async function executeLiveSwap(
  params: { inputMint: string; outputMint: string; amountBaseUnits: string; inDecimals: number; outDecimals: number },
  wallet: TradeWallet,
  context?: SwapContext,
): Promise<SwapFill> {
  if (params.amountBaseUnits === "0") throw new Error("That amount is too small to trade.");

  const order = await getUltraOrder({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amountBaseUnits,
    taker: wallet.publicKey.toBase58(),
  });
  if (!order.transaction) {
    throw new Error("Jupiter could not build a transaction for this order. Check your balance.");
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  if (wallet.deferred && context) {
    stageContinuation({
      kind: "swap",
      requestId: order.requestId,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inDecimals: params.inDecimals,
      outDecimals: params.outDecimals,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
      inUsd: order.inUsdValue,
      outUsd: order.outUsdValue,
      payWith: context.payWith,
      wallet: wallet.publicKey.toBase58(),
      trade: context.trade,
    });
  }
  const signed = await wallet.signTransaction(tx);
  const signedBase64 = Buffer.from(signed.serialize()).toString("base64");
  return submitSigned(signedBase64, order.requestId, {
    inAmount: order.inAmount,
    outAmount: order.outAmount,
    inUsd: order.inUsdValue,
    outUsd: order.outUsdValue,
  });
}

async function submitSigned(
  signedBase64: string,
  requestId: string,
  order: { inAmount: string; outAmount: string; inUsd?: number; outUsd?: number },
): Promise<SwapFill> {
  const result = await executeUltraOrder(signedBase64, requestId);
  if (result.status !== "Success" || !result.signature) {
    throw new Error(result.error ? `Swap failed: ${result.error}` : "Swap failed. Nothing was spent.");
  }
  return {
    signature: result.signature,
    inUnits: result.inputAmountResult ?? order.inAmount,
    outUnits: result.outputAmountResult ?? order.outAmount,
    inUsd: order.inUsd,
    outUsd: order.outUsd,
  };
}

/**
 * Second half of a swap whose signature came back through a deeplink:
 * submit the signed bytes Phantom returned against the order that was
 * staged before the hop. Same Jupiter call, same fill shape.
 */
export async function finishDeferredSwap(c: Extract<Continuation, { kind: "swap" }>, signedTx: Uint8Array): Promise<SwapFill> {
  return submitSigned(Buffer.from(signedTx).toString("base64"), c.requestId, c);
}

/** Dollar value of the settlement leg: Jupiter's own USD figure when it gave one, else at the live SOL price. */
export function settlementDollars(usd: number | undefined, settledAmount: number, payWith: SettlementCurrency): number {
  if (typeof usd === "number" && usd > 0) return usd;
  return payWith === "SOL" ? settledAmount * (getSolPrice() ?? 0) : settledAmount;
}

/** Turns a landed xStock swap into the TradeResult every screen understands. */
export function fillToTradeResult(
  fill: SwapFill,
  info: { ticker: TickerSymbol; side: TradeSide; payWith: SettlementCurrency; tokenDecimals: number },
): TradeResult {
  const isBuy = info.side === "buy";
  const settle = SETTLEMENT[info.payWith];
  const shares = fromBaseUnits(isBuy ? fill.outUnits : fill.inUnits, info.tokenDecimals);
  const settledAmount = fromBaseUnits(isBuy ? fill.inUnits : fill.outUnits, settle.decimals);
  const dollars = settlementDollars(isBuy ? fill.inUsd : fill.outUsd, settledAmount, info.payWith);
  return {
    success: true,
    mode: "live",
    ticker: info.ticker,
    side: info.side,
    quantity: shares,
    pricePerShare: shares > 0 ? dollars / shares : 0,
    totalValue: dollars,
    txId: fill.signature,
    timestamp: Date.now(),
    settledIn: info.payWith,
    settledAmount,
  };
}

/** Converts a dollar amount into base units of the settlement currency. */
export function settlementBaseUnits(dollars: number, payWith: SettlementCurrency): string {
  const solUsd = getSolPrice();
  if (payWith === "SOL" && !solUsd) throw new Error("SOL price unavailable right now. Try again in a moment.");
  const settle = SETTLEMENT[payWith];
  return toBaseUnits(payWith === "SOL" ? dollars / solUsd! : dollars, settle.decimals);
}

async function executeLiveTrade(
  { ticker, side, quantity, totalValue, payWith = "SOL", copiedFromInvestorId }: TradeParams,
  wallet: TradeWallet,
): Promise<TradeResult> {
  const token = getTokenForSymbol(ticker);
  if (!token) throw new Error(`No Solana mint known for ${ticker} yet. Try again in a moment.`);
  const settle = SETTLEMENT[payWith];
  const isBuy = side === "buy";

  const fill = await executeLiveSwap(
    {
      inputMint: isBuy ? settle.mint : token.mint,
      outputMint: isBuy ? token.mint : settle.mint,
      amountBaseUnits: isBuy ? settlementBaseUnits(totalValue, payWith) : toBaseUnits(quantity, token.decimals),
      inDecimals: isBuy ? settle.decimals : token.decimals,
      outDecimals: isBuy ? token.decimals : settle.decimals,
    },
    wallet,
    { payWith, trade: { kind: "xstock", ticker, side, copiedFromInvestorId } },
  );
  return fillToTradeResult(fill, { ticker, side, payWith, tokenDecimals: token.decimals });
}
