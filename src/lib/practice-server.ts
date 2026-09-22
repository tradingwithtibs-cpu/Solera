import { HttpError } from "./auth-server";
import { getSupabaseService } from "./supabase";
import { MY_CASH_BALANCE } from "./mock-data";
import { isKnownTicker } from "./catalog";
import { jupiterPriceForMint, mintForTicker } from "./prices-server";
import { normalizeThesis, settlePractice, validateFillInput, type PracticeFill, type PracticeFillInput, type PracticeRow } from "./fills";
import type { HoldingPosition, TickerSymbol, Transaction } from "./types";
import type { TradeResult } from "./trade";

/**
 * The practice ledger for signed-in owners: one row per owner in
 * practice_portfolios, a history in practice_fills. Fills are priced here,
 * from Jupiter, at settlement; the client never tells the server a price.
 * Optimistic concurrency on `version` keeps a tap in the browser and the
 * plan evaluator from settling on the same balance.
 */
interface PortfolioRow {
  owner: string;
  cash: number | string;
  holdings: HoldingPosition[];
  version: number;
  updated_at: string;
  imported_at: string | null;
}

interface FillRow {
  id: string;
  owner: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number | string;
  price_per_share: number | string;
  total_value: number | string;
  note: string | null;
  wrong_if: string | null;
  leg: "gap" | "mark" | null;
  via: PracticeFill["via"];
  plan_id: string | null;
  copied_from: string | null;
  created_at: string;
}

const FILL_COLUMNS = "id, owner, ticker, side, quantity, price_per_share, total_value, note, wrong_if, leg, via, plan_id, copied_from, created_at";

function service() {
  const s = getSupabaseService();
  if (!s) throw new HttpError(501, "Practice accounts aren't enabled on this deployment yet.");
  return s;
}

function toRow(r: PortfolioRow): PracticeRow {
  return {
    owner: r.owner,
    cash: Number(r.cash),
    holdings: Array.isArray(r.holdings) ? r.holdings.filter((h) => h && isKnownTicker(h.ticker) && Number.isFinite(h.shares) && h.shares > 0) : [],
    version: r.version,
    updatedAt: Date.parse(r.updated_at),
  };
}

export function toFill(r: FillRow): PracticeFill {
  return {
    id: r.id,
    owner: r.owner,
    ticker: r.ticker,
    side: r.side,
    quantity: Number(r.quantity),
    pricePerShare: Number(r.price_per_share),
    totalValue: Number(r.total_value),
    note: r.note ?? undefined,
    wrongIf: r.wrong_if ?? undefined,
    leg: r.leg ?? undefined,
    via: r.via,
    planId: r.plan_id ?? undefined,
    copiedFrom: r.copied_from ?? undefined,
    createdAt: Date.parse(r.created_at),
  };
}

/** A fill as the client's Transaction shape. */
export function fillToTransaction(f: PracticeFill): Transaction {
  return {
    id: f.id,
    ticker: f.ticker,
    side: f.side,
    quantity: f.quantity,
    pricePerShare: f.pricePerShare,
    totalValue: f.totalValue,
    timestamp: f.createdAt,
    copiedFromInvestorId: f.copiedFrom,
    note: f.note,
    wrongIf: f.wrongIf,
    leg: f.leg,
    via: f.via,
    planId: f.planId,
  };
}

export async function loadPractice(owner: string): Promise<{ portfolio: PracticeRow | null; fills: PracticeFill[] }> {
  const s = service();
  const [row, fills] = await Promise.all([
    s.from("practice_portfolios").select("*").eq("owner", owner).maybeSingle(),
    s.from("practice_fills").select(FILL_COLUMNS).eq("owner", owner).order("created_at", { ascending: false }).limit(100),
  ]);
  if (row.error) throw new HttpError(502, row.error.message);
  if (fills.error) throw new HttpError(502, fills.error.message);
  return { portfolio: row.data ? toRow(row.data as PortfolioRow) : null, fills: ((fills.data ?? []) as FillRow[]).map(toFill) };
}

/** The owner's row, created with the starting cash if missing. */
export async function ensurePractice(owner: string): Promise<PracticeRow> {
  const s = service();
  const existing = await s.from("practice_portfolios").select("*").eq("owner", owner).maybeSingle();
  if (existing.error) throw new HttpError(502, existing.error.message);
  if (existing.data) return toRow(existing.data as PortfolioRow);
  const created = await s
    .from("practice_portfolios")
    .insert({ owner, cash: MY_CASH_BALANCE, holdings: [] })
    .select("*")
    .single();
  if (created.error) throw new HttpError(502, created.error.message);
  return toRow(created.data as PortfolioRow);
}

export async function resetPractice(owner: string): Promise<PracticeRow> {
  const s = service();
  const current = await ensurePractice(owner);
  const updated = await s
    .from("practice_portfolios")
    .update({ cash: MY_CASH_BALANCE, holdings: [], version: current.version + 1, updated_at: new Date().toISOString() })
    .eq("owner", owner)
    .select("*")
    .single();
  if (updated.error) throw new HttpError(502, updated.error.message);
  return toRow(updated.data as PortfolioRow);
}

/** Seeds the row from a device's local practice history; refuses when a row already exists. */
export async function importPractice(
  owner: string,
  data: { cash: number; holdings: HoldingPosition[]; fills: Transaction[] },
): Promise<PracticeRow> {
  const s = service();
  const existing = await s.from("practice_portfolios").select("owner").eq("owner", owner).maybeSingle();
  if (existing.data) throw new HttpError(409, "This account already has a practice portfolio.");
  const cash = Number.isFinite(data.cash) && data.cash >= 0 ? data.cash : MY_CASH_BALANCE;
  const holdings = (data.holdings ?? []).filter((h) => h && isKnownTicker(h.ticker) && Number.isFinite(h.shares) && h.shares > 0);
  const created = await s
    .from("practice_portfolios")
    .insert({ owner, cash, holdings, imported_at: new Date().toISOString() })
    .select("*")
    .single();
  if (created.error) throw new HttpError(502, created.error.message);
  const rows = (data.fills ?? [])
    .filter((t) => t && isKnownTicker(t.ticker) && Number.isFinite(t.quantity) && t.quantity > 0 && Number.isFinite(t.pricePerShare) && t.pricePerShare > 0)
    .slice(0, 500)
    .map((t) => ({
      owner,
      ticker: t.ticker,
      side: t.side ?? "buy",
      quantity: t.quantity,
      price_per_share: t.pricePerShare,
      total_value: t.totalValue > 0 ? t.totalValue : t.quantity * t.pricePerShare,
      note: t.note ?? null,
      via: "ticket",
      copied_from: t.copiedFromInvestorId ?? null,
      created_at: new Date(Number.isFinite(t.timestamp) ? t.timestamp : Date.now()).toISOString(),
    }));
  if (rows.length > 0) await s.from("practice_fills").insert(rows);
  return toRow(created.data as PortfolioRow);
}

/**
 * Settles a practice order at the live Jupiter price. Returns the fill,
 * the new portfolio and a TradeResult in the shape every screen already
 * understands. Throws HttpError: 400 for a bad order, 503 with no price,
 * 409 (with the current portfolio attached) when the version moved.
 */
export async function fillPractice(
  owner: string,
  input: PracticeFillInput,
): Promise<{ fill: PracticeFill; portfolio: PracticeRow; result: TradeResult }> {
  const problem = validateFillInput(input);
  if (problem) throw new HttpError(400, problem);
  const token = await mintForTicker(input.ticker);
  if (!token) throw new HttpError(400, `No Solana mint known for ${input.ticker} yet.`);
  const price = await jupiterPriceForMint(token.mint);
  if (!price) throw new HttpError(503, `No live price for ${input.ticker} right now.`);

  const s = service();
  const current = await ensurePractice(owner);
  if (typeof input.expectedVersion === "number" && input.expectedVersion !== current.version) {
    throw Object.assign(new HttpError(409, "Your practice balance changed. Take another look."), { portfolio: current });
  }
  const now = Date.now();
  let settled: ReturnType<typeof settlePractice>;
  try {
    settled = settlePractice(current, { ticker: input.ticker as TickerSymbol, side: input.side, quantity: input.quantity, amountUsd: input.amountUsd, price }, now);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "This order is invalid.");
  }
  const updated = await s
    .from("practice_portfolios")
    .update({ cash: settled.row.cash, holdings: settled.row.holdings, version: settled.row.version, updated_at: new Date(now).toISOString() })
    .eq("owner", owner)
    .eq("version", current.version)
    .select("*");
  if (updated.error) throw new HttpError(502, updated.error.message);
  if (!updated.data || updated.data.length === 0) {
    const fresh = await ensurePractice(owner);
    throw Object.assign(new HttpError(409, "Your practice balance changed. Take another look."), { portfolio: fresh });
  }
  const thesis = normalizeThesis(input);
  const inserted = await s
    .from("practice_fills")
    .insert({
      owner,
      ticker: settled.fill.ticker,
      mint: token.mint,
      side: settled.fill.side,
      quantity: settled.fill.quantity,
      price_per_share: settled.fill.pricePerShare,
      total_value: settled.fill.totalValue,
      note: thesis.note ?? null,
      wrong_if: thesis.wrongIf ?? null,
      leg: thesis.leg ?? null,
      via: thesis.via ?? "ticket",
      plan_id: thesis.planId ?? null,
      copied_from: thesis.copiedFrom ?? null,
      created_at: new Date(now).toISOString(),
    })
    .select(FILL_COLUMNS)
    .single();
  if (inserted.error) throw new HttpError(502, inserted.error.message);
  const fill = toFill(inserted.data as FillRow);
  const portfolio = toRow(updated.data[0] as PortfolioRow);
  const result: TradeResult = {
    success: true,
    mode: "practice",
    ticker: fill.ticker,
    side: fill.side,
    quantity: fill.quantity,
    pricePerShare: fill.pricePerShare,
    totalValue: fill.totalValue,
    txId: `PRACTICE${fill.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    timestamp: now,
  };
  return { fill, portfolio, result };
}
