import type { TickerSymbol, TradeSide } from "./types";

/**
 * Standing plans in plain words, as data. A plan is a sentence the person
 * wrote, the condition Solera read from it, and a status. Practice plans
 * are filled by the server when the price condition is met; live plans
 * become a Jupiter Trigger order or wait as "ready to sign". Pure types,
 * validation and wording live here; storage is plans-server.ts.
 */
export type PlanMode = "practice" | "live";
export type PlanExecution = "server" | "trigger" | "notify";
export type PlanStatus = "proposed" | "armed" | "holding" | "ready" | "done" | "failed" | "expired" | "cancelled";

export type PlanTrigger = { kind: "now" } | { kind: "price"; op: "gte" | "lte"; price: number };
export type PlanAction =
  | { side: "buy"; amountUsd: number }
  | { side: "buy"; shares: number }
  | { side: "sell"; shares: number }
  | { side: "sell"; fraction: number };
export interface PlanExit {
  kind: "target" | "stop";
  price: number;
}

export interface PlanCondition {
  ticker: TickerSymbol;
  trigger: PlanTrigger;
  action: PlanAction;
  /** Buys only; at most one target and one stop. */
  exits: PlanExit[];
  /** A human condition, shown on the position, never evaluated. */
  wrongIf?: string;
  leg?: "gap" | "mark";
  note?: string;
  payWith?: "SOL" | "USDC";
  /** Days the plan stays armed (default 30). */
  armDays?: number;
}

export interface PlanLogEntry {
  at: number;
  from: PlanStatus | null;
  to: PlanStatus;
  msg: string;
}

export interface Plan {
  id: string;
  owner: string;
  wallet: string | null;
  mode: PlanMode;
  execution: PlanExecution;
  text: string;
  condition: PlanCondition;
  summary: string;
  status: PlanStatus;
  armUntil: number | null;
  holdUntil: number | null;
  triggerOrderId: string | null;
  triggerState: string | null;
  /** The deposit that opened the Jupiter order, verified on-chain when it was stored. */
  triggerDepositSig?: string | null;
  /** When the browser last mirrored Jupiter's order state. */
  triggerCheckedAt?: number | null;
  readyAt: number | null;
  filled: { price: number; shares: number; at: number; fillId?: string } | null;
  log: PlanLogEntry[];
  source: "ui" | "agent";
  evaluatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export const PLAN_TEXT_MAX = 280;
export const DEFAULT_ARM_DAYS = 30;
export const MAX_ARM_DAYS = 90;
export const ACTIVE_STATUSES: PlanStatus[] = ["armed", "holding", "ready"];

const TICKER = /^[A-Z0-9.]{1,12}x$/;

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shares(n: number): string {
  return `${Number(n.toFixed(4)).toString()} share${n === 1 ? "" : "s"}`;
}

/** User-facing problem with a condition, or null. `standing` forbids trigger "now". */
export function validateCondition(raw: unknown, opts: { standing?: boolean } = {}): string | null {
  const c = raw as Partial<PlanCondition> | null;
  if (!c || typeof c !== "object") return "That plan is empty.";
  if (typeof c.ticker !== "string" || !TICKER.test(c.ticker)) return "Which ticker?";
  const t = c.trigger;
  if (!t || typeof t !== "object") return "When should it happen?";
  if (t.kind === "now") {
    if (opts.standing !== false) return "A standing plan needs a price condition. For an order right now, use the ticket.";
  } else if (t.kind === "price") {
    if (t.op !== "gte" && t.op !== "lte") return "Above or below?";
    if (!(typeof t.price === "number" && Number.isFinite(t.price) && t.price > 0)) return "At what price?";
  } else return "When should it happen?";
  const a = c.action as Partial<PlanAction & { amountUsd?: number; shares?: number; fraction?: number }> | undefined;
  if (!a || (a.side !== "buy" && a.side !== "sell")) return "Buy or sell?";
  const amountUsd = "amountUsd" in a ? a.amountUsd : undefined;
  const sh = "shares" in a ? a.shares : undefined;
  const fr = "fraction" in a ? a.fraction : undefined;
  const given = [amountUsd, sh, fr].filter((v) => v !== undefined).length;
  if (given !== 1) return a.side === "buy" ? "How much: a dollar amount or a number of shares?" : "How many shares, or what fraction?";
  if (amountUsd !== undefined && !(Number.isFinite(amountUsd) && amountUsd >= 1)) return "The minimum is $1.";
  if (sh !== undefined && !(Number.isFinite(sh) && sh > 0)) return "Shares must be more than zero.";
  if (fr !== undefined && !(Number.isFinite(fr) && fr > 0 && fr <= 1)) return "A fraction is between 0 and 1.";
  if (a.side === "sell" && amountUsd !== undefined) return "Sell a number of shares or a fraction, not a dollar amount.";
  const exits = Array.isArray(c.exits) ? c.exits : [];
  if (a.side === "sell" && exits.length > 0) return "Exits only make sense after a buy.";
  let targets = 0;
  let stops = 0;
  for (const e of exits) {
    if (!e || (e.kind !== "target" && e.kind !== "stop") || !(typeof e.price === "number" && e.price > 0)) return "An exit needs a price.";
    if (e.kind === "target") targets++;
    else stops++;
  }
  if (targets > 1 || stops > 1) return "At most one target and one stop.";
  if (t.kind === "price") {
    for (const e of exits) {
      if (e.kind === "stop" && t.op === "gte" && e.price >= t.price) return "Your stop is above your entry.";
      if (e.kind === "target" && t.op === "lte" && e.price <= t.price) return "Your target is below your entry.";
    }
  }
  if (c.wrongIf !== undefined && String(c.wrongIf).length > 160) return 'Keep "wrong if" under 160 characters.';
  if (c.note !== undefined && String(c.note).length > 280) return "Keep the note under 280 characters.";
  if (c.armDays !== undefined && !(Number.isFinite(c.armDays) && c.armDays > 0 && c.armDays <= MAX_ARM_DAYS)) return `A plan can stay armed for up to ${MAX_ARM_DAYS} days.`;
  return null;
}

/** The plan in one sentence, the way the card and the agent restate it. */
export function describe(c: PlanCondition): string {
  const when =
    c.trigger.kind === "now"
      ? "now"
      : `when ${c.ticker} is at or ${c.trigger.op === "gte" ? "above" : "below"} ${money(c.trigger.price)}`;
  const a = c.action;
  const act =
    a.side === "buy"
      ? "amountUsd" in a
        ? `buy ${money(a.amountUsd)}`
        : `buy ${shares(a.shares)}`
      : "shares" in a
        ? `sell ${shares(a.shares)}`
        : `sell ${a.fraction === 1 ? "everything" : `${Math.round(a.fraction * 100)}%`}`;
  const parts = [`${when} → ${act}${c.trigger.kind === "now" ? ` of ${c.ticker}` : ""}`];
  if (c.exits.length > 0) {
    const target = c.exits.find((e) => e.kind === "target");
    const stop = c.exits.find((e) => e.kind === "stop");
    const bits = [target ? `target ${money(target.price)}` : null, stop ? `stop ${money(stop.price)}` : null].filter(Boolean);
    parts.push(`then hold until ${bits.join(" or ")}`);
  }
  if (c.wrongIf) parts.push(`wrong if “${c.wrongIf}”`);
  return parts.join(" · ");
}

/** A level check, not a tick-level cross: gte fires at or above, lte at or below. */
export function met(trigger: PlanTrigger, price: number): boolean {
  if (trigger.kind === "now") return true;
  return trigger.op === "gte" ? price >= trigger.price : price <= trigger.price;
}

/** Which exit a price hits, if any. */
export function exitHit(exits: PlanExit[], price: number): PlanExit | null {
  for (const e of exits) {
    if (e.kind === "target" && price >= e.price) return e;
    if (e.kind === "stop" && price <= e.price) return e;
  }
  return null;
}

export function sideOf(c: PlanCondition): TradeSide {
  return c.action.side;
}

export function isActive(status: PlanStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
