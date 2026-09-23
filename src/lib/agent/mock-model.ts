import type Anthropic from "@anthropic-ai/sdk";
import { COMPANIES, type CompanyId } from "../pre-ipo";
import { parsePlanSentence, type ParseResult } from "../plan-parser";
import type { PlanCondition } from "../plans";
import type { TickerSymbol } from "../types";
import type { AgentModel, AgentState, Msg, PendingDraft, Turn } from "./types";

/**
 * The offline parser (docs/port/backend.md §7.6, agent-ux.md §1.8): a rule
 * set over the last user message that emits the same tool_use blocks Claude
 * would, then a final text after it sees the tool results. It never guesses
 * a size or a direction, never invents a number, and says what it can do
 * when it cannot follow. Runs when no ANTHROPIC_API_KEY is set.
 */
export interface MockOptions {
  resolveTicker: (word: string) => TickerSymbol | undefined;
}

const HELP = "I can set up price plans (“buy $100 of NVDAx if it drops to 170”), fetch prices and news, and list or cancel your plans.";
const NEWS = /\bnews\b|\bheadlines?\b|\blatest on\b|\bwhat'?s (?:happening|going on|new) with\b|\bany updates? on\b/i;
const PRICE = /\bprices?\b|\bquote\b|\btrading at\b|\bwhat'?s\b.*\bat\b|\bhow much is\b|\bworth\b|\bcost\b/i;
const PLANS = /\b(?:my|list|show|open|active|past|see)\s+(?:my\s+)?plans?\b|^\s*plans?\s*\??\s*$/i;
const CANCEL = /\bcancel\b|\bstop plan\b|\bremove plan\b/i;
const EXPLAIN = /\bexplain\b|\bwhy did\b|\bwhat happened (?:to|with)\b|\bstatus of\b/i;
const SIZE_ONLY = /^\s*(?:\$\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:dollars?|usd|bucks|shares?|tokens?)?|all|everything|half|a third|a quarter)\s*\.?\s*$/i;
const DIRECTION_ONLY = /^\s*(above|over|higher|up|below|under|lower|down)\s*\.?\s*$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ORDINALS: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5 };
const STOP = new Set(["the", "and", "for", "with", "what", "whats", "show", "news", "latest", "price", "prices", "quote", "about", "any", "how", "much", "worth", "cost", "trading", "now", "today", "please", "tell", "give", "get", "check", "look", "find", "list", "plans", "plan", "cancel", "explain", "status", "buy", "sell", "shares", "share"]);

function text(t: string, pendingDraft: PendingDraft | null = null): Turn {
  return { content: [{ type: "text", text: t, citations: null }], stop_reason: "end_turn", pendingDraft };
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function readState(messages: Msg[]): AgentState | null {
  const first = messages.find((m) => m.role === "user");
  const raw = typeof first?.content === "string" ? first.content : first?.content.map((b) => (b.type === "text" ? b.text : "")).join("\n") ?? "";
  const m = raw.match(/<state>([\s\S]*?)<\/state>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as AgentState;
  } catch {
    return null;
  }
}

function lastUserText(messages: Msg[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  const raw = typeof last.content === "string" ? last.content : last.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  return raw.replace(/<state>[\s\S]*?<\/state>\s*/, "").trim();
}

/** The tool_result blocks of the last user message paired with the tool_use blocks they answer. */
function toolResults(messages: Msg[]): Array<{ name: string; input: unknown; result: Record<string, unknown>; isError: boolean }> | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || typeof last.content === "string") return null;
  const results = last.content.filter((b) => b.type === "tool_result");
  if (results.length === 0) return null;
  const prev = messages[messages.length - 2];
  const uses = prev && prev.role === "assistant" && typeof prev.content !== "string" ? prev.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use") : [];
  return results.map((r) => {
    const use = uses.find((u) => u.id === r.tool_use_id);
    const content = typeof r.content === "string" ? r.content : (r.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      parsed = { error: content };
    }
    return { name: use?.name ?? "unknown", input: use?.input, result: parsed, isError: !!r.is_error };
  });
}

/** The strict-schema shape create_plan takes: nulls where the library uses unions. */
export function toToolCondition(c: PlanCondition) {
  const a = c.action;
  return {
    ticker: c.ticker,
    trigger: c.trigger.kind === "price" ? { kind: "price" as const, op: c.trigger.op, price: c.trigger.price } : { kind: "price" as const, op: "gte" as const, price: 0 },
    action: {
      side: a.side,
      amountUsd: "amountUsd" in a ? a.amountUsd : null,
      shares: "shares" in a ? a.shares : null,
      fraction: "fraction" in a ? a.fraction : null,
    },
    exits: c.exits,
    wrongIf: c.wrongIf ?? null,
    note: c.note ?? null,
    armDays: c.armDays ?? null,
  };
}

export class MockModel implements AgentModel {
  readonly name = "mock" as const;
  private n = 0;

  constructor(private readonly opts: MockOptions) {}

  private tool(name: string, input: unknown): Turn {
    this.n += 1;
    return { content: [{ type: "tool_use", id: `mock_${this.n}`, name, input }], stop_reason: "tool_use" };
  }

  private tickersIn(sentence: string): TickerSymbol[] {
    const out: TickerSymbol[] = [];
    for (const w of sentence.replace(/[^A-Za-z0-9.\s]/g, " ").split(/\s+/)) {
      if (w.length < 2 || /^\d/.test(w) || STOP.has(w.toLowerCase())) continue;
      const t = this.opts.resolveTicker(w);
      if (t && !out.includes(t)) out.push(t);
    }
    return out;
  }

  private companyIn(sentence: string): CompanyId | undefined {
    const s = sentence.toLowerCase();
    return (Object.values(COMPANIES).find((c) => s.includes(c.name.toLowerCase()) || new RegExp(`\\b${c.id}\\b`).test(s)) ?? undefined)?.id;
  }

  private planIdIn(sentence: string, state: AgentState | null): string | null {
    const uuid = sentence.match(UUID);
    if (uuid) return uuid[0];
    const open = state?.openPlans ?? [];
    const word = sentence.toLowerCase().match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last|\d{1,2})\b/);
    if (!word) return open.length === 1 ? open[0].id : null;
    const n = word[1] === "last" ? open.length : (ORDINALS[word[1]] ?? Number(word[1]));
    return open.find((p) => p.n === n)?.id ?? null;
  }

  async complete(req: { messages: Msg[] }): Promise<Turn> {
    const state = readState(req.messages);
    const results = toolResults(req.messages);
    if (results) return text(this.afterTools(results, state));
    return this.firstTurn(lastUserText(req.messages), state);
  }

  private firstTurn(raw: string, state: AgentState | null): Turn {
    const mode = state?.mode ?? "practice";
    let sentence = raw;
    const draft = state?.pendingDraft ?? null;
    if (draft) {
      if (SIZE_ONLY.test(raw)) {
        let size = raw.trim().replace(/\.$/, "");
        if (/^[\d,]+(?:\.\d+)?$/.test(size)) size = draft.condition.side === "sell" ? `${size} shares` : `$${size}`;
        sentence = `${draft.text} ${size}`;
      } else if (DIRECTION_ONLY.test(raw)) {
        const up = /above|over|higher|up/i.test(raw);
        sentence = draft.text.replace(/\b(?:at|hits?|reaches|touches)\s*(\$?\s?\d)/i, `${up ? "over" : "under"} $1`);
      }
    }
    const planLike = /\b(buy|sell)\b/i.test(sentence);
    if (state?.intent === "plan_preview" || planLike) {
      if (!planLike) return text("Write the plan with buy or sell, a ticker, a price and a size — “buy $100 of NVDAx if it drops to 170”.");
      return this.planTurn(sentence, mode);
    }
    if (NEWS.test(raw)) {
      const company = this.companyIn(raw);
      const tickers = this.tickersIn(raw);
      if (company) return this.tool("get_news", { ticker: null, company });
      if (tickers.length) return this.tool("get_news", { ticker: tickers[0], company: null });
      if (state?.ticker) return this.tool("get_news", { ticker: state.ticker, company: null });
      return text("News on which ticker?");
    }
    if (PRICE.test(raw)) {
      const tickers = this.tickersIn(raw);
      if (tickers.length) return this.tool("get_prices", { tickers: tickers.slice(0, 20) });
      if (state?.ticker) return this.tool("get_prices", { tickers: [state.ticker] });
      return text("Which ticker's price?");
    }
    if (CANCEL.test(raw)) {
      const id = this.planIdIn(raw, state);
      if (id) return this.tool("cancel_plan", { planId: id });
      if (!state?.signedIn) return text("Sign in to manage your plans.");
      return text(state.openPlans.length ? "Which plan? Say its number from your plans list." : "You have no open plans to cancel.");
    }
    if (EXPLAIN.test(raw)) {
      const id = this.planIdIn(raw, state);
      if (id) return this.tool("explain_plan", { planId: id });
      return text(state?.signedIn ? "Which plan? Say its number from your plans list." : "Sign in to see your plans.");
    }
    if (PLANS.test(raw)) return this.tool("list_plans", { status: /\bpast\b|\bold\b|\bhistory\b/i.test(raw) ? "past" : "active" });
    const stray = this.tickersIn(raw);
    if (stray.length && raw.trim().split(/\s+/).length <= 3) return this.tool("get_prices", { tickers: stray });
    return text(HELP);
  }

  private planTurn(sentence: string, mode: "practice" | "live"): Turn {
    const parsed: ParseResult = parsePlanSentence(sentence, { resolveTicker: this.opts.resolveTicker });
    const p = parsed.partial;
    const draft: PendingDraft = { text: sentence, condition: p };
    if (parsed.condition) {
      const c = parsed.condition;
      if (c.trigger.kind === "now") return this.orderTurn(c, sentence);
      return this.tool("create_plan", { text: sentence, condition: toToolCondition(c), mode });
    }
    // No price at all but a full order otherwise → an immediate order, per agent-ux §1.8.
    if (parsed.question && /At what price/.test(parsed.question) && p.ticker && p.side && p.action) {
      return this.orderTurn({ ticker: p.ticker, trigger: { kind: "now" }, action: p.action, exits: [] }, sentence);
    }
    const keep = p.ticker || p.side ? draft : null;
    return text(parsed.question ?? HELP, keep);
  }

  private orderTurn(c: PlanCondition, sentence: string): Turn {
    const a = c.action;
    if (a.side === "sell" && "fraction" in a) return text(`How many ${c.ticker} shares?`, { text: sentence, condition: { ticker: c.ticker, side: "sell" } });
    return this.tool("place_practice_order", {
      ticker: c.ticker,
      side: a.side,
      amountUsd: "amountUsd" in a ? a.amountUsd : null,
      shares: "shares" in a ? a.shares : null,
      note: c.note ?? null,
    });
  }

  private afterTools(results: NonNullable<ReturnType<typeof toolResults>>, state: AgentState | null): string {
    const lines: string[] = [];
    for (const r of results) {
      const x = r.result;
      if (r.isError) {
        lines.push(String(x.error ?? "That didn't work."));
        continue;
      }
      switch (r.name) {
        case "create_plan": {
          const mode = String(x.mode ?? state?.mode ?? "practice");
          lines.push(x.signedIn === false ? `Proposed: ${x.summary} (${mode}). ${x.next}` : `Proposed: ${x.summary} (${mode}). Tap Arm it to start it.`);
          break;
        }
        case "get_news": {
          const items = (x.items as Array<{ headline: string; source: string }>) ?? [];
          const input = (r.input ?? {}) as { ticker?: string | null; company?: CompanyId | null };
          const label = input.ticker ?? (input.company ? COMPANIES[input.company].name : "the market");
          if (items.length === 0) lines.push(`No recent headlines for ${label}.`);
          else lines.push([`Latest on ${label} (${x.source}):`, ...items.map((i, n) => `${n + 1}. ${i.headline} — ${i.source}`)].join("\n"));
          break;
        }
        case "get_prices": {
          const prices = (x.prices as Record<string, number>) ?? {};
          const at = typeof x.fetchedAt === "string" ? x.fetchedAt.slice(11, 16) + "Z" : "";
          const quoted = Object.entries(prices).map(([t, p]) => `${t}: ${money(p)}`);
          const missing = (x.missing as string[]) ?? [];
          lines.push(`${quoted.join(" · ")} (Jupiter, ${at}).${missing.length ? ` No live price for ${missing.join(", ")}.` : ""}`);
          break;
        }
        case "list_plans": {
          const plans = (x.plans as Array<{ summary: string; status: string; mode: string }>) ?? [];
          if (plans.length === 0) lines.push(`No ${x.which === "past" ? "past" : "open"} plans yet.`);
          else lines.push(plans.map((p, n) => `${n + 1}. ${p.summary} — ${p.status} (${p.mode})`).join("\n"));
          break;
        }
        case "cancel_plan":
          lines.push(x.needsSignature ? `That plan is a Jupiter order; cancelling needs your signature. Use Cancel on the plan card.` : `Cancelled: ${x.summary}.`);
          break;
        case "place_practice_order": {
          const t = (x.ticket ?? {}) as { ticker: string; side: string; amountUsd?: number; shares?: number; mode: string };
          const size = t.amountUsd !== undefined ? `${money(t.amountUsd)} of ${t.ticker}` : `${t.shares} ${t.ticker}`;
          lines.push(`Order: ${t.side} ${size} at the live price (${t.mode}). Review it in the ticket to confirm.`);
          break;
        }
        case "explain_plan":
          lines.push(String(x.text ?? ""));
          break;
        case "get_catalog": {
          const tokens = (x.tokens as Array<{ symbol: string; name: string }>) ?? [];
          lines.push(tokens.length ? tokens.map((t) => `${t.symbol} (${t.name})`).join(", ") : "Nothing in the catalog matches.");
          break;
        }
        default:
          lines.push("Done.");
      }
    }
    return lines.join("\n\n");
  }
}
