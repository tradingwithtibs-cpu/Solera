import type { AgentCard, AgentModelName, PendingDraft } from "../../lib/agent/types";
import { DEFAULT_ARM_DAYS, type PlanCondition, type PlanExecution, type PlanMode } from "../../lib/plans";

/**
 * Pure helpers behind the Agent tab (docs/port/agent-ux.md §1, §4): the
 * copy that must be verbatim, the eyebrow built from a tool trace, the
 * starter chips built from live prices, the ticket link, the thread trim.
 * No React, no window, relative imports only, so tests/agent-ui.test.mjs
 * can load this file through the TS transpile harness.
 */
export const AGENT_FOOT = "Composed from live figures. Nothing here is a forecast or a recommendation. Plans are armed only after you confirm; nothing is signed without your wallet.";
export const EMPTY_LINE = "Ask about a token, a gap, your notes, or write a plan in plain words.";
export const SIGN_IN_LINE = "Sign in to keep plans running while you're away.";
export const PRACTICE_ORDER_LINE = "Practice fills use practice cash. No real order is placed.";
export const CONFIRM_LINE = "Plans are armed only after you confirm; nothing is signed without your wallet.";
export const MESSAGE_MAX = 4_000;
export const THREAD_TURNS = 12;

export const CANONICAL_PROMPTS = ["buy AAPLx if it goes over $345", "show me the latest news on TSLAx"] as const;

/** The third canonical prompt: `$X` from the live TSLAx price (floor of 90%), or a literal X when there is none. */
export function thirdPrompt(tslaPrice?: number): string {
  const x = tslaPrice !== undefined && Number.isFinite(tslaPrice) && tslaPrice > 0 ? String(Math.floor(tslaPrice * 0.9)) : "X";
  return `if TSLAx falls to $${x} sell 5 shares`;
}

/** The three canonical prompts in order, for the first chip row and the cycling placeholder. */
export function canonicalPrompts(tslaPrice?: number): string[] {
  return [...CANONICAL_PROMPTS, thirdPrompt(tslaPrice)];
}

/** Starter chips (§1.3): the canonical three first, then only what the tool set answers honestly. */
export function starterChips(opts: { tslaPrice?: number; live: boolean }): { primary: string[]; secondary: string[] } {
  const secondary = ["what's NVDAx at?", "my plans"];
  if (!opts.live) secondary.push("buy $50 of SPYx now");
  return { primary: canonicalPrompts(opts.tslaPrice), secondary };
}

/** The card subtitle by model (§1.2). Before the model is known, the model-agnostic half. */
export function subtitleFor(model: AgentModelName | null): string {
  if (model === "anthropic") return "Claude · reads live prices, news and your plans · never signs";
  if (model === "mock") return "offline parser · no model attached yet · never signs";
  return "reads live prices, news and your plans · never signs";
}

const TOOL_LABELS: Record<string, string> = {
  get_prices: "live prices",
  get_news: "news",
  get_catalog: "the catalog",
  list_plans: "your plans",
  create_plan: "your plans",
  cancel_plan: "your plans",
  explain_plan: "your plans",
  place_practice_order: "the ticket",
};

/** `from live prices · your plans` from the tools that ran, in first-seen order; `composed` when none did. */
export function eyebrowFor(trace: ReadonlyArray<{ name: string }> | undefined): string {
  const labels: string[] = [];
  for (const t of trace ?? []) {
    const label = TOOL_LABELS[t.name];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.length ? `from ${labels.join(" · ")}` : "composed";
}

/** The §1.5 error row copy. `null` status = the request never reached the route. */
export function errorCopy(status: number | null): string {
  if (status === 501) return "Agent isn't configured on this deployment yet.";
  return `The agent isn't available right now (${status === null ? "no connection" : status}). Your plans are unaffected.`;
}

export interface ThreadTurnLike {
  role: "user" | "assistant";
  text: string;
}

/** The plain-text history the route takes: the last `max` turns, trimmed to the route's per-message cap. */
export function trimTurns<T extends ThreadTurnLike>(turns: readonly T[], max = THREAD_TURNS): Array<{ role: "user" | "assistant"; content: string }> {
  return turns.slice(-max).map((t) => ({ role: t.role, content: t.text.slice(0, MESSAGE_MAX) }));
}

export type TicketCardData = Extract<AgentCard, { kind: "ticket" }>;

/** `/buy/SPYx?side=buy&amount=50&via=agent`: the ticket prefills from these and still runs its own review step. */
export function ticketHref(card: Pick<TicketCardData, "ticker" | "side" | "amountUsd" | "shares" | "note">): string {
  const q = new URLSearchParams();
  q.set("side", card.side);
  if (card.amountUsd !== undefined) q.set("amount", String(card.amountUsd));
  else if (card.shares !== undefined) q.set("shares", String(card.shares));
  if (card.note) q.set("note", card.note);
  q.set("via", "agent");
  return `/buy/${encodeURIComponent(card.ticker)}?${q.toString()}`;
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sharesText(n: number): string {
  return `${Number(n.toFixed(4)).toString()} share${n === 1 ? "" : "s"}`;
}

/** `(−21.0%)`: the trigger's distance from the current price, signed. */
export function triggerDistance(now: number, trigger: number): string {
  if (!(now > 0)) return "";
  const pct = ((trigger - now) / now) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `(${sign}${Math.abs(pct).toFixed(1)}%)`;
}

/** The DOES row: the action, with today's value in brackets when a live price exists. */
export function doesRow(c: PlanCondition, price?: number): string {
  const a = c.action;
  const live = price !== undefined && price > 0;
  if (a.side === "buy") {
    if ("amountUsd" in a) return `buy ${money(a.amountUsd)} of ${c.ticker}${live ? ` (≈ ${Number((a.amountUsd / price).toFixed(4))} shares at today's price)` : ""}`;
    return `buy ${sharesText(a.shares)} ${c.ticker}${live ? ` (≈ ${money(a.shares * price)} at today's price)` : ""}`;
  }
  if ("shares" in a) return `sell ${sharesText(a.shares)} ${c.ticker}${live ? ` (≈ ${money(a.shares * price)} at today's price)` : ""}`;
  return `sell ${a.fraction === 1 ? "everything" : `${Math.round(a.fraction * 100)}%`} of your ${c.ticker}`;
}

/** The THEN row, or null when the plan has no exits. */
export function thenRow(c: PlanCondition): string | null {
  if (!c.exits.length) return null;
  const target = c.exits.find((e) => e.kind === "target");
  const stop = c.exits.find((e) => e.kind === "stop");
  const bits = [target ? `target ${money(target.price)}` : null, stop ? `stop ${money(stop.price)}` : null].filter(Boolean);
  return `hold until ${bits.join(" or ")}`;
}

export function levelText(c: PlanCondition): string {
  if (c.trigger.kind !== "price") return "now";
  return `at or ${c.trigger.op === "gte" ? "above" : "below"} ${money(c.trigger.price)}`;
}

/** What leaves the wallet for a Jupiter vault, and whether that noun is plural. */
function vaultAmount(c: PlanCondition): { text: string; plural: boolean } {
  const a = c.action;
  if (a.side === "buy") return "amountUsd" in a ? { text: money(a.amountUsd), plural: false } : { text: `funds for ${sharesText(a.shares)}`, plural: true };
  if ("shares" in a) return { text: `${Number(a.shares.toFixed(4))} ${c.ticker}`, plural: a.shares !== 1 };
  return { text: `${c.ticker} (${a.fraction === 1 ? "all of it" : `${Math.round(a.fraction * 100)}%`})`, plural: false };
}

/** The "What happens" paragraph (§1.6), one of three, by mode and executor. */
export function whatHappens(c: PlanCondition, mode: PlanMode, execution: PlanExecution): string {
  if (mode !== "live") return `Solera fills it in practice cash on its server when the price is ${levelText(c)}, checked about once a minute. ${CONFIRM_LINE}`;
  if (execution === "trigger") {
    const v = vaultAmount(c);
    return `Becomes a Jupiter Trigger order you sign once. Your ${v.text} ${v.plural ? "move" : "moves"} to a Jupiter vault now and ${v.plural ? "stay" : "stays"} there until it fills, expires, or you cancel. Jupiter's keepers watch 24/7. ${CONFIRM_LINE}`;
  }
  return `Jupiter can't watch this one${c.wrongIf ? ` (“${c.wrongIf}”)` : ""}. Solera will notify you when the price is there and prefill the ticket; you tap once to sign. Nothing is signed on your behalf.`;
}

export function armedToast(summary: string): string {
  return `Armed: ${summary}`;
}

export function notifyToast(c: PlanCondition): string {
  return `Armed. You'll get a notification here when ${c.ticker} is ${levelText(c)}.`;
}

/** `draft · buy AAPLx when at or above $345.00 · size?` under a bubble that asked a question. */
export function describeDraft(d: PendingDraft): string {
  const c = d.condition;
  const side = c.side ?? c.action?.side;
  const parts: string[] = [];
  const head = [side, c.ticker].filter(Boolean).join(" ");
  if (head) parts.push(head);
  if (c.trigger?.kind === "price") parts.push(`when at or ${c.trigger.op === "gte" ? "above" : "below"} ${money(c.trigger.price)}`);
  const missing = !c.ticker ? "ticker?" : !c.action ? "size?" : !c.trigger ? "direction?" : "…";
  return `${parts.join(" ") || d.text} · ${missing}`;
}

/** The order card sentence: `buy $50.00 of SPYx at the live price`. */
export function orderSentence(card: Pick<TicketCardData, "ticker" | "side" | "amountUsd" | "shares">): string {
  const size = card.amountUsd !== undefined ? money(card.amountUsd) : sharesText(card.shares ?? 0);
  return `${card.side} ${size} of ${card.ticker} at the live price`;
}

/** `≈ 0.0646 shares` for a dollar order, `≈ $1,547.66` for a share order, at the live price. */
export function orderSize(card: Pick<TicketCardData, "amountUsd" | "shares">, price: number): string {
  if (!(price > 0)) return "";
  if (card.amountUsd !== undefined) return `≈ ${Number((card.amountUsd / price).toFixed(4))} shares`;
  return `≈ ${money((card.shares ?? 0) * price)}`;
}

/** `12:03:41Z` from unix ms. */
export function utcClock(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().slice(11, 19)}Z`;
}

/** Coarse age with the clock injected, so render never reads Date.now(). */
export function relativeAge(timestamp: number, now: number | null): string {
  if (!now) return "";
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** `Oct 22, 2026`. */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The UNTIL row: an exact `armUntil` once armed, else the default window from now. */
export function untilRow(c: PlanCondition, now: number | null, armUntil?: number | null): string {
  const days = c.armDays ?? DEFAULT_ARM_DAYS;
  const at = armUntil ?? (now ? now + days * 86_400_000 : null);
  return at ? `${shortDate(at)} (${days} days)` : `${days} days`;
}

/** ARM IT's label by state (§1.6). */
export function armLabel(opts: { signedIn: boolean; cardLive: boolean; toggleLive: boolean }): string {
  if (!opts.signedIn) return "SIGN IN TO ARM";
  if (opts.cardLive && !opts.toggleLive) return "SWITCH TO LIVE TO ARM";
  return "ARM IT";
}
