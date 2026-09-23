import { COMPANIES, PRESTOCKS_SYMBOLS, TESSERA_CODES, type CompanyId } from "../pre-ipo";
import { HttpError } from "../http-error";
import { ACTIVE_STATUSES, describe, validateCondition, type PlanAction, type PlanCondition, type PlanExit, type PlanStatus } from "../plans";
import { NOTE_MAX } from "../fills";
import { validateAgainst } from "./schema";
import { toolSchema } from "./tools";
import type { AgentCard, ToolContext, ToolDeps, ToolOutcome } from "./types";

/**
 * Runs one tool call against the library (never HTTP to ourselves) and
 * turns the result into JSON for the model plus, where a card belongs, the
 * card the UI renders. Cards come from here, never from the model's prose,
 * so a card can never claim something the server did not do.
 */
const SIGN_IN = "Sign in to keep plans running while you're away.";
const NEWS_LIMIT = 8;

function ok(result: unknown, card?: AgentCard): ToolOutcome {
  return { content: JSON.stringify(result), ...(card ? { card } : {}) };
}

function fail(message: string): ToolOutcome {
  return { content: JSON.stringify({ error: message }), isError: true };
}

/** AAPL → AAPLx, aaplx → AAPLx, TSLAx → TSLAx. */
export function normalizeTicker(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const base = /x$/i.test(s) && s.length > 1 ? s.slice(0, -1) : s;
  return `${base.toUpperCase()}x`;
}

function preIpoName(raw: string): string | null {
  const s = raw.trim();
  const upper = s.toUpperCase().replace(/X$/, "");
  if (upper in PRESTOCKS_SYMBOLS) return COMPANIES[PRESTOCKS_SYMBOLS[upper]].name;
  if (s in TESSERA_CODES) return COMPANIES[TESSERA_CODES[s]].name;
  const byName = Object.values(COMPANIES).find((c) => c.name.toLowerCase() === s.toLowerCase() || c.id === s.toLowerCase());
  return byName ? byName.name : null;
}

interface ToolCondition {
  ticker: string;
  trigger: { kind: "price"; op: "gte" | "lte"; price: number };
  action: { side: "buy" | "sell"; amountUsd: number | null; shares: number | null; fraction: number | null };
  exits: PlanExit[];
  wrongIf: string | null;
  note: string | null;
  armDays: number | null;
}

/** The strict-schema shape → the library's PlanCondition (unions instead of nulls). */
export function fromToolCondition(c: ToolCondition): PlanCondition {
  const a = c.action;
  let action: PlanAction;
  if (a.side === "buy") action = a.amountUsd !== null ? { side: "buy", amountUsd: a.amountUsd } : { side: "buy", shares: a.shares ?? Number.NaN };
  else action = a.shares !== null ? { side: "sell", shares: a.shares } : { side: "sell", fraction: a.fraction ?? Number.NaN };
  const out: PlanCondition = { ticker: normalizeTicker(c.ticker), trigger: { kind: "price", op: c.trigger.op, price: c.trigger.price }, action, exits: c.exits ?? [] };
  if (c.wrongIf) out.wrongIf = c.wrongIf.trim().slice(0, 160);
  if (c.note) out.note = c.note.trim().slice(0, NOTE_MAX);
  if (c.armDays) out.armDays = Math.round(c.armDays);
  return out;
}

const PAST: PlanStatus[] = ["done", "failed", "expired", "cancelled"];

export async function execute(name: string, rawInput: unknown, ctx: ToolContext, deps: ToolDeps): Promise<ToolOutcome> {
  const schema = toolSchema(name);
  if (!schema) return fail(`Unknown tool ${name}.`);
  const problem = validateAgainst(schema, rawInput);
  if (problem) return fail(problem);
  try {
    switch (name) {
      case "get_prices": {
        const { tickers } = rawInput as { tickers: string[] };
        const wanted = [...new Set(tickers.map(normalizeTicker))];
        const { prices, fetchedAt } = await deps.prices(wanted);
        const missing = wanted.filter((t) => !(prices[t] > 0));
        const result = { prices, fetchedAt: new Date(fetchedAt).toISOString(), source: "Jupiter", missing };
        return Object.keys(prices).length ? ok(result, { kind: "prices", prices, fetchedAt }) : fail(`No live price for ${missing.join(", ")} right now.`);
      }
      case "get_news": {
        const { ticker, company } = rawInput as { ticker: string | null; company: CompanyId | null };
        if (!!ticker === !!company) return fail("Pass exactly one of ticker or company.");
        if (ticker && preIpoName(ticker)) return fail(`${preIpoName(ticker)} is a private company; call get_news with company instead.`);
        const q = ticker ? { ticker: normalizeTicker(ticker) } : { company: company as CompanyId };
        const res = await deps.news(q);
        const items = res.items.slice(0, NEWS_LIMIT);
        const result = {
          items: items.map((i) => ({ headline: i.headline, source: i.source, publishedAt: new Date(i.publishedAt).toISOString(), url: i.url })),
          source: res.source === "finnhub" ? "Finnhub" : "Google News",
          fetchedAt: new Date(res.fetchedAt).toISOString(),
        };
        return ok(result, { kind: "news", ...q, items, source: res.source });
      }
      case "get_catalog": {
        const { query } = rawInput as { query: string };
        const q = query.trim().toLowerCase();
        const tokens = (await deps.catalog()).filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).slice(0, 10);
        return ok({ tokens: tokens.map((t) => ({ symbol: t.symbol, name: t.name, mint: t.mint, usdPrice: t.usdPrice, liquidityUsd: t.liquidityUsd })) });
      }
      case "create_plan": {
        const input = rawInput as { text: string; condition: ToolCondition; mode: "practice" | "live" };
        const condition = fromToolCondition(input.condition);
        const invalid = validateCondition(condition, { standing: true });
        if (invalid) return fail(invalid);
        if (!(await deps.isTradable(condition.ticker))) return fail(`No Solana mint known for ${condition.ticker} yet.`);
        const mode = ctx.mode;
        if (mode === "live" && !ctx.wallet) return fail("Connect a wallet to arm a live plan.");
        const text = input.text.trim().slice(0, 280);
        if (!ctx.owner) {
          const execution = mode === "practice" ? "server" : "notify";
          const summary = describe(condition);
          return ok(
            { planId: null, summary, mode, execution, status: "proposed", signedIn: false, next: SIGN_IN },
            { kind: "plan", planId: null, summary, mode, execution, status: "proposed", condition, text },
          );
        }
        const plan = await deps.createPlan({ owner: ctx.owner, wallet: ctx.wallet, mode, text, condition, source: "agent" });
        return ok(
          { planId: plan.id, summary: plan.summary, mode: plan.mode, execution: plan.execution, status: plan.status },
          { kind: "plan", planId: plan.id, summary: plan.summary, mode: plan.mode, execution: plan.execution, status: "proposed", condition: plan.condition, text: plan.text },
        );
      }
      case "list_plans": {
        if (!ctx.owner) return fail("Sign in to see your plans.");
        const { status } = rawInput as { status: "active" | "past" | null };
        const which = status ?? "active";
        const plans = (await deps.listPlans(ctx.owner))
          .filter((p) => (which === "past" ? PAST.includes(p.status) : p.status === "proposed" || ACTIVE_STATUSES.includes(p.status)))
          .slice(0, 20)
          .map((p) => ({ id: p.id, summary: p.summary, status: p.status, mode: p.mode, createdAt: p.createdAt }));
        return ok({ which, plans: plans.map((p) => ({ ...p, createdAt: new Date(p.createdAt).toISOString() })) }, { kind: "plans", plans });
      }
      case "cancel_plan": {
        if (!ctx.owner) return fail("Sign in to manage your plans.");
        const { planId } = rawInput as { planId: string };
        const plan = await deps.getPlan(planId, ctx.owner);
        if (!plan) return fail("No such plan.");
        if (plan.execution === "trigger" && (plan.status === "armed" || plan.status === "holding")) {
          return ok({ planId, needsSignature: true, summary: plan.summary, note: "This is a Jupiter order; cancelling withdraws the vault and needs the person's signature in the app." });
        }
        const next = await deps.cancelPlan(plan);
        return ok({ planId: next.id, status: next.status, summary: next.summary });
      }
      case "place_practice_order": {
        const input = rawInput as { ticker: string; side: "buy" | "sell"; amountUsd: number | null; shares: number | null; note: string | null };
        const pre = preIpoName(input.ticker);
        if (pre) return fail(`Pre-IPO tokens (${pre}) are bought for real, from your wallet. Switch to live and open the Pre-IPO card.`);
        if ((input.amountUsd === null) === (input.shares === null)) return fail("Give exactly one size: a dollar amount or a number of shares.");
        if (input.side === "sell" && input.amountUsd !== null) return fail("Sell a number of shares, not a dollar amount.");
        const ticker = normalizeTicker(input.ticker);
        if (!(await deps.isTradable(ticker))) return fail(`No Solana mint known for ${ticker} yet.`);
        const ticket = {
          ticker,
          side: input.side,
          ...(input.amountUsd !== null ? { amountUsd: input.amountUsd } : {}),
          ...(input.shares !== null ? { shares: input.shares } : {}),
          ...(input.note ? { note: input.note.trim().slice(0, NOTE_MAX) } : {}),
          mode: ctx.mode,
        };
        return ok({ ticket, next: "The app opens the ticket; the person reviews and confirms it." }, { kind: "ticket", ...ticket });
      }
      case "explain_plan": {
        if (!ctx.owner) return fail("Sign in to see your plans.");
        const { planId } = rawInput as { planId: string };
        const plan = await deps.getPlan(planId, ctx.owner);
        if (!plan) return fail("No such plan.");
        const tail = plan.log.slice(-3).map((l) => `${new Date(l.at).toISOString().slice(0, 16).replace("T", " ")}Z — ${l.msg}`);
        const text = [`${describe(plan.condition)} · ${plan.status} (${plan.mode}${plan.execution === "trigger" ? ", Jupiter order" : plan.execution === "notify" ? ", notify + sign" : ""})`, ...tail].join("\n");
        return ok({ text }, { kind: "explain", planId, text });
      }
      default:
        return fail(`Unknown tool ${name}.`);
    }
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message);
    return fail(err instanceof Error ? err.message : "That didn't work.");
  }
}
