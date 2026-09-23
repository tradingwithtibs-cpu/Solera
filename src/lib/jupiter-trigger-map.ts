import type { PlanCondition } from "./plans";
import { SETTLEMENT, toBaseUnits, type SettlementCurrency } from "./tokens";

/**
 * A PlanCondition → a Jupiter Trigger V2 price order (docs/port/backend.md
 * §9.2), or the reason Jupiter cannot hold it (→ the notify fallback).
 * Pure: prices and balances come in through `ctx`, nothing is fetched.
 */
export type TriggerSubType = "single" | "oco" | "otoco";

export interface PriceOrderBody {
  userPubkey: string;
  inputMint: string;
  outputMint: string;
  /** Base units of inputMint. */
  inputAmount: string;
  triggerMint: string;
  triggerCondition: "above" | "below";
  triggerPriceUsd: number;
  tpPriceUsd?: number;
  slPriceUsd?: number;
  /** ISO time; Jupiter's recommended maximum is 30 days. */
  expiresAt: string;
  slippageBps: number;
  orderType: "price";
  orderSubType: TriggerSubType;
}

export interface TriggerContext {
  wallet: string;
  token: { mint: string; decimals: number; symbol: string };
  /** The xStock's USD price now. */
  price: number;
  /** SOL in USD; needed when paying with SOL. */
  solUsd?: number;
  /** Live balance of the xStock, for fraction sells. */
  heldShares?: number;
  now: number;
  armUntil?: number;
  payWith?: SettlementCurrency;
  slippageBps?: number;
}

export type TriggerMapping =
  | {
      ok: true;
      order: PriceOrderBody;
      depositSubType: TriggerSubType;
      /** The deposit in the person's words: "0.25 SOL" or "5 TSLAx". */
      deposit: { amount: number; unit: string; usd: number };
      summary: string;
      disclosures: string[];
      expiresAt: number;
    }
  | { ok: false; reason: string };

export const TRIGGER_MIN_USD = 10;
export const TRIGGER_MAX_DAYS = 30;
export const SLIPPAGE_DEFAULT_BPS = 200;
export const SLIPPAGE_MIN_BPS = 50;
export const SLIPPAGE_MAX_BPS = 1000;
/** Headroom on a share-sized buy so the fill covers the shares after slippage. */
const SHARE_BUY_HEADROOM = 1.005;
const DAY_MS = 86_400_000;

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function amountText(n: number, unit: string): string {
  const digits = unit === "SOL" ? 4 : unit === "USDC" ? 2 : 4;
  return `${Number(n.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits })} ${unit}`;
}

function dateText(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function clampSlippage(bps: number | undefined): number {
  if (bps === undefined || !Number.isFinite(bps)) return SLIPPAGE_DEFAULT_BPS;
  return Math.min(SLIPPAGE_MAX_BPS, Math.max(SLIPPAGE_MIN_BPS, Math.round(bps)));
}

/** min(armUntil, now + 30 d), never in the past. */
export function triggerExpiry(now: number, armUntil?: number): number {
  const cap = now + TRIGGER_MAX_DAYS * DAY_MS;
  const wanted = armUntil && armUntil > now ? armUntil : cap;
  return Math.min(wanted, cap);
}

export function toTriggerOrder(c: PlanCondition, ctx: TriggerContext): TriggerMapping {
  if (c.trigger.kind !== "price") return { ok: false, reason: "An order right now goes through the ticket, not a standing order." };
  if (c.leg) return { ok: false, reason: "Jupiter can't watch pre-IPO tokens for a leg; Solera will notify you." };
  if (!(ctx.price > 0)) return { ok: false, reason: `No live price for ${ctx.token.symbol} right now.` };
  const a = c.action;
  const condition: "above" | "below" = c.trigger.op === "gte" ? "above" : "below";
  const expiresAt = triggerExpiry(ctx.now, ctx.armUntil);
  const slippageBps = clampSlippage(ctx.slippageBps);
  const target = c.exits.find((e) => e.kind === "target");
  const stop = c.exits.find((e) => e.kind === "stop");
  const base = { userPubkey: ctx.wallet, triggerMint: ctx.token.mint, triggerCondition: condition, triggerPriceUsd: c.trigger.price, expiresAt: new Date(expiresAt).toISOString(), slippageBps, orderType: "price" as const };
  const whenText = `when ${ctx.token.symbol} is at or ${condition === "above" ? "above" : "below"} ${money(c.trigger.price)}`;
  const untilText = `Expires ${dateText(expiresAt)}.`;

  if (a.side === "buy") {
    const payWith: SettlementCurrency = ctx.payWith ?? "SOL";
    const settle = SETTLEMENT[payWith];
    if (payWith === "SOL" && !(ctx.solUsd && ctx.solUsd > 0)) return { ok: false, reason: "SOL price unavailable right now. Try again in a moment." };
    const usd = "amountUsd" in a ? a.amountUsd : a.shares * ctx.price * SHARE_BUY_HEADROOM;
    if (usd < TRIGGER_MIN_USD) return { ok: false, reason: `Jupiter can't hold an order under ${money(TRIGGER_MIN_USD)}; Solera will notify you instead.` };
    const settleAmount = payWith === "SOL" ? usd / ctx.solUsd! : usd;
    let subType: TriggerSubType = "single";
    if (target && stop) subType = "otoco";
    else if (target || stop) return { ok: false, reason: "Jupiter needs both a target and a stop to hold a bought position; Solera will watch this one and notify you." };
    const order: PriceOrderBody = {
      ...base,
      inputMint: settle.mint,
      outputMint: ctx.token.mint,
      inputAmount: toBaseUnits(settleAmount, settle.decimals),
      orderSubType: subType,
      ...(subType === "otoco" ? { tpPriceUsd: target!.price, slPriceUsd: stop!.price } : {}),
    };
    const sizeText = "amountUsd" in a ? `${amountText(settleAmount, payWith)} (≈ ${money(usd)})` : `${amountText(settleAmount, payWith)} (≈ ${money(usd)}, about ${Number(a.shares.toFixed(4))} shares)`;
    const then = subType === "otoco" ? ` Then a target at ${money(target!.price)} and a stop at ${money(stop!.price)}.` : "";
    return {
      ok: true,
      order,
      depositSubType: subType,
      deposit: { amount: settleAmount, unit: payWith, usd },
      summary: `Buy ${ctx.token.symbol} with ${sizeText} ${whenText}.${then} ${untilText}`,
      disclosures: disclosures(amountText(settleAmount, payWith), c.trigger.price, slippageBps),
      expiresAt,
    };
  }

  // Sells: the xStock leaves the wallet for the vault at arm time.
  const payWith: SettlementCurrency = ctx.payWith ?? "USDC";
  const settle = SETTLEMENT[payWith];
  let shares: number;
  if ("shares" in a) shares = a.shares;
  else {
    if (!(ctx.heldShares && ctx.heldShares > 0)) return { ok: false, reason: `No live ${ctx.token.symbol} balance to size the sell from.` };
    shares = a.fraction * ctx.heldShares;
  }
  if (!(shares > 0)) return { ok: false, reason: "Nothing to sell." };
  const usd = shares * ctx.price;
  if (usd < TRIGGER_MIN_USD) return { ok: false, reason: `Jupiter can't hold an order under ${money(TRIGGER_MIN_USD)}; Solera will notify you instead.` };
  const order: PriceOrderBody = {
    ...base,
    inputMint: ctx.token.mint,
    outputMint: settle.mint,
    inputAmount: toBaseUnits(shares, ctx.token.decimals),
    orderSubType: "single",
  };
  const sharesText = `${Number(shares.toFixed(4))} ${ctx.token.symbol}`;
  return {
    ok: true,
    order,
    depositSubType: "single",
    deposit: { amount: shares, unit: ctx.token.symbol, usd },
    summary: `Sell ${sharesText} for ${payWith} ${whenText}. ${untilText}`,
    disclosures: disclosures(sharesText, c.trigger.price, slippageBps),
    expiresAt,
  };
}

function disclosures(depositText: string, triggerPrice: number, slippageBps: number): string[] {
  return [
    `Your ${depositText} moves to a Jupiter vault now and stays there until the order fills, expires, or you cancel.`,
    `Jupiter's keepers fill it 24/7; the fill price can differ from ${money(triggerPrice)} by up to ${(slippageBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} % (slippage). Orders can fill partially.`,
    "Jupiter watches the token's on-chain price in dollars, not the stock exchange price.",
    "Cancelling, or getting expired funds back, needs one more signature.",
    `Minimum order ${money(TRIGGER_MIN_USD)}.`,
    "Solera never holds keys or funds. The vault is Jupiter's, and only your wallet can withdraw from it.",
  ];
}
