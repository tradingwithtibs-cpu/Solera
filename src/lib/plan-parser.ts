import { describe, type PlanAction, type PlanCondition, type PlanExit, type PlanTrigger } from "./plans";
import type { TickerSymbol } from "./types";

/**
 * Plain-English plans → conditions, deterministically. Used by the Plans
 * composer preview, the mock model, and as the agent's safety net. It never
 * guesses: a missing ticker, direction, price or size becomes a question.
 * Grammar (docs/port/backend.md §7.6): direction words set gte/lte, the
 * number after them is the trigger price, "$N" is a dollar size, "N shares"
 * a share size, "all/half/a third/a quarter" a sell fraction, "until N"
 * a target, "stop N" a stop, "until <words>" a wrong-if, "for N days" the
 * arm window.
 */
export interface ParseContext {
  /** Resolves a word ("aapl", "aaplx", "tesla") to a ticker, or undefined. */
  resolveTicker: (word: string) => TickerSymbol | undefined;
}

export interface ParseResult {
  condition?: PlanCondition;
  /** What the composer should ask next; set when the sentence is incomplete. */
  question?: string;
  /** The partial read, for the agent to carry between turns. */
  partial: Partial<PlanCondition> & { side?: "buy" | "sell" };
  summary?: string;
}

const NUM = "\\$?\\s?([\\d][\\d,]*(?:\\.\\d+)?)";
const GTE = /\b(?:goes|gets|is|rises?|climbs?|moves?|breaks?|trades?|pops?|jumps?)?\s*(?:over|above|past|up\s+to|to\s+or\s+above|at\s+or\s+above|higher\s+than)\s*\$?\s?([\d][\d,]*(?:\.\d+)?)/i;
const RISES_TO = /\b(?:rises?|climbs?|rallies|goes\s+up|gets\s+up|moves\s+up)\s+(?:to|at)\s*\$?\s?([\d][\d,]*(?:\.\d+)?)/i;
const LTE = /\b(?:goes|gets|is|falls?|drops?|dips?|slides?|sinks?|comes?|pulls?\s+back|trades?)?\s*(?:under|below|beneath|down\s+to|to\s+or\s+below|at\s+or\s+below|lower\s+than)\s*\$?\s?([\d][\d,]*(?:\.\d+)?)/i;
const FALLS_TO = /\b(?:falls?|drops?|dips?|slides?|sinks?|goes\s+down|pulls?\s+back|comes\s+down)\s+(?:to|at)\s*\$?\s?([\d][\d,]*(?:\.\d+)?)/i;
const AT_PRICE = /\b(?:at|hits?|reaches|touches)\s*\$?\s?([\d][\d,]*(?:\.\d+)?)/i;
const STOP = /\bstop(?:\s*(?:loss|at|of))?\s*\$?\s?([\d][\d,]*(?:\.\d+)?)/i;
const TARGET = new RegExp(`\\b(?:hold\\s+)?until\\s+(?:it\\s+)?(?:hits?\\s+|reaches\\s+|is\\s+at\\s+)?${NUM}`, "i");
const UNTIL_WORDS = /\b(?:or\s+)?until\s+(?!(?:it\s+)?(?:hits?\s+|reaches\s+)?\$?\s?\d)([^,.;]+)/i;
const FOR_DAYS = /\bfor\s+(\d+)\s*(day|days|week|weeks)\b/i;
const DOLLARS = /\$\s?([\d][\d,]*(?:\.\d+)?)/g;
const DOLLAR_WORDS = /\b([\d][\d,]*(?:\.\d+)?)\s*(?:dollars?|usd|bucks)\b/i;
const SHARES = /\b([\d][\d,]*(?:\.\d+)?)\s*(?:shares?|tokens?)\b/i;
const FRACTION = /\b(all|everything|half|a\s+third|a\s+quarter|(\d{1,3})\s*%)\b/i;
const STOPWORDS = new Set(["if", "it", "the", "a", "an", "of", "to", "at", "and", "or", "buy", "sell", "when", "then", "hold", "until", "stop", "for", "days", "day", "weeks", "week", "shares", "share", "now", "with", "my", "in", "is", "goes", "gets", "over", "above", "under", "below", "falls", "drops", "rises", "climbs", "dips", "on", "into", "out", "all", "half", "some", "more", "less", "than", "price", "worth", "dollars", "usd", "sol", "usdc", "target", "loss", "gap", "mark", "leg"]);

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** Words that could be a ticker, in order of appearance, upper-cased. */
function candidates(text: string): string[] {
  return text
    .replace(/[^A-Za-z0-9.\s$]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !w.startsWith("$") && !/^\d/.test(w) && !STOPWORDS.has(w.toLowerCase()) && w.length <= 12);
}

export function parsePlanSentence(text: string, ctx: ParseContext): ParseResult {
  const raw = text.trim();
  const partial: ParseResult["partial"] = {};
  if (!raw) return { question: "Write the plan in plain words.", partial };

  // Ticker
  let ticker: TickerSymbol | undefined;
  for (const w of candidates(raw)) {
    ticker = ctx.resolveTicker(w);
    if (ticker) break;
  }
  if (ticker) partial.ticker = ticker;

  // Side
  const buyAt = raw.search(/\bbuy\b/i);
  const sellAt = raw.search(/\bsell\b/i);
  const side: "buy" | "sell" | undefined = buyAt >= 0 && (sellAt < 0 || buyAt < sellAt) ? "buy" : sellAt >= 0 ? "sell" : undefined;
  if (side) partial.side = side;

  // Trigger: direction phrase + price. Remove it from the text before reading sizes.
  let trigger: PlanTrigger | undefined;
  let rest = raw;
  let ambiguousPrice: number | undefined;
  const take = (re: RegExp, op: "gte" | "lte") => {
    const m = rest.match(re);
    if (!m) return false;
    trigger = { kind: "price", op, price: num(m[1]) };
    rest = rest.replace(m[0], " ");
    return true;
  };
  if (!(take(RISES_TO, "gte") || take(FALLS_TO, "lte") || take(GTE, "gte") || take(LTE, "lte"))) {
    if (/\bnow\b/i.test(rest) && !/\buntil\b|\bif\b|\bwhen\b/i.test(rest)) {
      trigger = { kind: "now" };
    } else {
      const m = rest.match(AT_PRICE);
      if (m) {
        ambiguousPrice = num(m[1]);
        rest = rest.replace(m[0], " ");
      }
    }
  }
  if (trigger) partial.trigger = trigger;

  // Exits and windows (read before sizes so their numbers are not mistaken for amounts).
  const exits: PlanExit[] = [];
  const stop = rest.match(STOP);
  if (stop) {
    exits.push({ kind: "stop", price: num(stop[1]) });
    rest = rest.replace(stop[0], " ");
  }
  const target = rest.match(TARGET);
  if (target) {
    exits.push({ kind: "target", price: num(target[1]) });
    rest = rest.replace(target[0], " ");
  }
  let wrongIf: string | undefined;
  const words = rest.match(UNTIL_WORDS);
  if (words) {
    wrongIf = words[1].trim().replace(/\s+/g, " ").slice(0, 160);
    rest = rest.replace(words[0], " ");
  }
  let armDays: number | undefined;
  const forDays = rest.match(FOR_DAYS);
  if (forDays) {
    armDays = Number(forDays[1]) * (/week/i.test(forDays[2]) ? 7 : 1);
    rest = rest.replace(forDays[0], " ");
  }

  // Size
  let action: PlanAction | undefined;
  const dollars = [...rest.matchAll(DOLLARS)].map((m) => num(m[1]));
  const spelled = rest.match(DOLLAR_WORDS);
  if (dollars.length === 0 && spelled) dollars.push(num(spelled[1]));
  const sh = rest.match(SHARES);
  const fr = rest.match(FRACTION);
  if (side === "buy") {
    if (dollars.length > 0) action = { side: "buy", amountUsd: dollars[0] };
    else if (sh) action = { side: "buy", shares: num(sh[1]) };
  } else if (side === "sell") {
    if (sh) action = { side: "sell", shares: num(sh[1]) };
    else if (fr) {
      const f = fr[1].toLowerCase();
      const fraction = f === "all" || f === "everything" ? 1 : f === "half" ? 0.5 : f.startsWith("a third") ? 1 / 3 : f.startsWith("a quarter") ? 0.25 : Number(fr[2]) / 100;
      if (fraction > 0 && fraction <= 1) action = { side: "sell", fraction };
    }
  }
  if (action) partial.action = action;
  if (exits.length) partial.exits = exits;
  if (wrongIf) partial.wrongIf = wrongIf;
  if (armDays) partial.armDays = armDays;

  // Questions, in the order a person would answer them.
  if (!ticker) return { question: "Which ticker?", partial };
  if (!side) return { question: `Buy or sell ${ticker}?`, partial };
  if (!trigger) {
    if (ambiguousPrice !== undefined) return { question: `Above or below $${ambiguousPrice}?`, partial };
    return { question: `At what price should ${ticker} trigger it? Say "over $X" or "under $X".`, partial };
  }
  if (!action) {
    return {
      question: side === "buy" ? `How much ${ticker} — a dollar amount or a number of shares?` : `How many ${ticker} shares, or what fraction (half, all)?`,
      partial,
    };
  }
  const condition: PlanCondition = { ticker, trigger, action, exits: side === "buy" ? exits : [] };
  if (wrongIf) condition.wrongIf = wrongIf;
  if (armDays) condition.armDays = armDays;
  return { condition, partial, summary: describe(condition) };
}

/** A resolver over the featured tickers plus any catalog list: symbol, symbol without x, or company name. */
export function makeResolver(entries: { symbol: string; name?: string }[]): ParseContext["resolveTicker"] {
  const bySymbol = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of entries) {
    bySymbol.set(e.symbol.toUpperCase(), e.symbol);
    bySymbol.set(e.symbol.toUpperCase().replace(/X$/, ""), e.symbol);
    if (e.name) byName.set(e.name.toLowerCase(), e.symbol);
  }
  return (word) => {
    const u = word.toUpperCase();
    return (bySymbol.get(u) ?? bySymbol.get(u.replace(/X$/, "")) ?? byName.get(word.toLowerCase())) as TickerSymbol | undefined;
  };
}
