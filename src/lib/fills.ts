import { applyFill, type PortfolioBalances } from "./ledger";
import type { HoldingPosition, TickerSymbol, TradeSide } from "./types";

/**
 * Fills with a thesis. A fill is a settled buy or sell; the optional note,
 * "wrong if" and pre-IPO leg ride along and surface on the position, the
 * feed and the tape. Pure validation and settlement live here so the
 * practice route, the evaluator and the tests agree.
 */
export const NOTE_MAX = 280;
export const WRONG_IF_MAX = 160;
export const TICKER_PATTERN = /^[A-Z0-9.]{1,12}x$/;

export type FillVia = "ticket" | "plan" | "agent" | "copy";
export type Leg = "gap" | "mark";

export interface ThesisFields {
  note?: string;
  wrongIf?: string;
  leg?: Leg;
  via?: FillVia;
  planId?: string;
  copiedFrom?: string;
}

export interface PracticeFillInput extends ThesisFields {
  ticker: string;
  side: TradeSide;
  /** Exactly one of quantity (shares) or amountUsd. */
  quantity?: number;
  amountUsd?: number;
  /** Optimistic concurrency: the portfolio version the client saw. */
  expectedVersion?: number;
}

export interface PracticeFill extends ThesisFields {
  id: string;
  owner: string;
  ticker: string;
  side: TradeSide;
  quantity: number;
  pricePerShare: number;
  totalValue: number;
  via: FillVia;
  createdAt: number;
}

export interface PracticeRow {
  owner: string;
  cash: number;
  holdings: HoldingPosition[];
  version: number;
  updatedAt: number;
}

const VIAS: FillVia[] = ["ticket", "plan", "agent", "copy"];

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

/** User-facing problem with the thesis fields, or null. Empty is fine: the note is optional. */
export function validateThesis(t: ThesisFields): string | null {
  if (t.note !== undefined && clean(t.note).length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  if (t.wrongIf !== undefined && clean(t.wrongIf).length > WRONG_IF_MAX) return `Keep "wrong if" under ${WRONG_IF_MAX} characters.`;
  if (t.leg !== undefined && t.leg !== "gap" && t.leg !== "mark") return "The leg is either gap or mark.";
  if (t.via !== undefined && !VIAS.includes(t.via)) return "Unknown fill source.";
  return null;
}

/** Normalised thesis fields (trimmed, empty strings dropped). */
export function normalizeThesis(t: ThesisFields): ThesisFields {
  const out: ThesisFields = {};
  const note = clean(t.note);
  const wrongIf = clean(t.wrongIf);
  if (note) out.note = note;
  if (wrongIf) out.wrongIf = wrongIf;
  if (t.leg) out.leg = t.leg;
  out.via = t.via && VIAS.includes(t.via) ? t.via : "ticket";
  if (t.planId) out.planId = t.planId;
  if (t.copiedFrom) out.copiedFrom = clean(t.copiedFrom).slice(0, 64);
  return out;
}

/** User-facing problem with a practice order, or null. */
export function validateFillInput(input: Partial<PracticeFillInput>): string | null {
  if (typeof input.ticker !== "string" || !TICKER_PATTERN.test(input.ticker)) return "Pick a tokenized stock.";
  if (input.side !== "buy" && input.side !== "sell") return "Choose buy or sell.";
  const hasQty = typeof input.quantity === "number" && Number.isFinite(input.quantity) && input.quantity > 0;
  const hasUsd = typeof input.amountUsd === "number" && Number.isFinite(input.amountUsd) && input.amountUsd > 0;
  if (hasQty === hasUsd) return "Give either a number of shares or a dollar amount.";
  if (hasUsd && input.side === "sell") return "Sell a number of shares, not a dollar amount.";
  if (hasUsd && input.amountUsd! < 1) return "The minimum practice order is $1.";
  return validateThesis(input);
}

/** Settles a priced order against a practice row: the new row and the fill. Throws the ledger's messages on bad orders. */
export function settlePractice(
  row: PracticeRow,
  order: { ticker: TickerSymbol; side: TradeSide; quantity?: number; amountUsd?: number; price: number },
  now: number,
): { row: PracticeRow; fill: Omit<PracticeFill, "id" | "owner" | "via"> } {
  if (!(order.price > 0)) throw new Error(`No live price for ${order.ticker} right now.`);
  const quantity = order.quantity ?? order.amountUsd! / order.price;
  const totalValue = quantity * order.price;
  const balances: PortfolioBalances = { cashBalance: row.cash, holdings: row.holdings };
  const next = applyFill(balances, { ticker: order.ticker, side: order.side, quantity, pricePerShare: order.price, totalValue });
  return {
    row: { ...row, cash: next.cashBalance, holdings: next.holdings, version: row.version + 1, updatedAt: now },
    fill: { ticker: order.ticker, side: order.side, quantity, pricePerShare: order.price, totalValue, createdAt: now },
  };
}

/** A fill as the tape and profile pages show it, from either table. */
export interface PublicFill {
  id: string;
  mode: "live" | "practice";
  owner: string;
  wallet: string | null;
  ticker: string | null;
  mint: string | null;
  side: TradeSide;
  quantity: number;
  pricePerShare: number;
  totalValue: number;
  note: string | null;
  wrongIf: string | null;
  leg: Leg | null;
  via: string;
  signature: string | null;
  createdAt: number;
}

export function rowToPublicFill(r: Record<string, unknown>, mode: "live" | "practice"): PublicFill {
  return {
    id: String(r.id),
    mode,
    owner: String(r.owner),
    wallet: (r.wallet as string | null | undefined) ?? null,
    ticker: (r.ticker as string | null | undefined) ?? null,
    mint: (r.mint as string | null | undefined) ?? null,
    side: r.side as TradeSide,
    quantity: Number(r.quantity),
    pricePerShare: Number(r.price_per_share),
    totalValue: Number(r.total_value),
    note: (r.note as string | null | undefined) ?? null,
    wrongIf: (r.wrong_if as string | null | undefined) ?? null,
    leg: (r.leg as Leg | null | undefined) ?? null,
    via: String(r.via ?? "ticket"),
    signature: (r.signature as string | null | undefined) ?? null,
    createdAt: Date.parse(String(r.created_at)),
  };
}
