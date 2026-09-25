import { exitHit, met, type Plan, type PlanStatus } from "./plans";
import type { PracticeFillInput } from "./fills";

/**
 * The watcher: once a minute (pg_cron → /api/plans/evaluate, or the open
 * tab for its own owner) it expires stale plans, prices the active ones,
 * fills practice plans whose condition is met, marks notify plans ready,
 * and closes holdings whose exit hit. Every dependency is injected so the
 * tests run it against fakes in milliseconds.
 */
export interface EvaluatorDeps {
  now: () => number;
  loadActive: (scopeOwner?: string) => Promise<Plan[]>;
  /** Prices in USD for tickers; missing tickers are skipped this pass. */
  priceFor: (tickers: string[]) => Promise<Record<string, number>>;
  fillPractice: (owner: string, input: PracticeFillInput) => Promise<{ fillId: string; quantity: number; pricePerShare: number }>;
  heldShares: (owner: string, ticker: string) => Promise<number>;
  savePlan: (id: string, patch: Partial<Plan> & { log: Plan["log"] }) => Promise<void>;
  inbox: (row: { owner: string; kind: "plan_ready" | "plan_filled" | "plan_failed" | "plan_expired"; planId: string; title: string; body: string; href?: string }) => Promise<void>;
  budgetMs: number;
}

/** How quiet the watcher may go before a request runs the shared pass itself. */
export const WATCH_STALE_MS = 50_000;

/**
 * Whether a request should run the shared minute pass: no plan has been
 * stamped for WATCH_STALE_MS (pg_cron off or lagging) and this process has
 * not tried within the same window. A null last stamp counts as stale.
 */
export function watchIsStale(lastEvaluatedAt: number | null, lastAttemptAt: number | null, now: number, staleMs = WATCH_STALE_MS): boolean {
  if (lastAttemptAt !== null && now - lastAttemptAt < staleMs) return false;
  return lastEvaluatedAt === null || now - lastEvaluatedAt >= staleMs;
}

export interface EvaluatorResult {
  pass: "minute" | "daily" | "self";
  scanned: number;
  fired: number;
  exited: number;
  expired: number;
  notified: number;
  failed: number;
  remaining: number;
  ms: number;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function log(plan: Plan, to: PlanStatus, msg: string, at: number) {
  return [...plan.log, { at, from: plan.status, to, msg }];
}

/** A plan's sell size at fill time. */
async function sellQuantity(deps: EvaluatorDeps, plan: Plan): Promise<number> {
  const a = plan.condition.action;
  if (a.side !== "sell") return 0;
  if ("shares" in a) return a.shares;
  const held = await deps.heldShares(plan.owner, plan.condition.ticker);
  return held * a.fraction;
}

export async function evaluatePlans(deps: EvaluatorDeps, opts: { pass: EvaluatorResult["pass"]; scopeOwner?: string }): Promise<EvaluatorResult> {
  const started = deps.now();
  const result: EvaluatorResult = { pass: opts.pass, scanned: 0, fired: 0, exited: 0, expired: 0, notified: 0, failed: 0, remaining: 0, ms: 0 };
  const plans = await deps.loadActive(opts.scopeOwner);
  result.scanned = plans.length;
  const over = () => deps.now() - started > deps.budgetMs;

  // 1. Expire.
  const live: Plan[] = [];
  for (const plan of plans) {
    const now = deps.now();
    if (plan.status === "armed" && plan.armUntil !== null && plan.armUntil < now) {
      await deps.savePlan(plan.id, { status: "expired", evaluatedAt: now, log: log(plan, "expired", "arm window ended", now) });
      await deps.inbox({ owner: plan.owner, kind: "plan_expired", planId: plan.id, title: `Plan expired: ${plan.condition.ticker}`, body: plan.summary });
      result.expired++;
    } else if (plan.status === "holding" && plan.holdUntil !== null && plan.holdUntil < now) {
      await deps.savePlan(plan.id, { status: "expired", evaluatedAt: now, log: log(plan, "expired", "hold window ended, position kept", now) });
      await deps.inbox({ owner: plan.owner, kind: "plan_expired", planId: plan.id, title: `Hold window ended: ${plan.condition.ticker}`, body: "The position stays in your portfolio." });
      result.expired++;
    } else live.push(plan);
  }

  // 2. Prices for what is left.
  const tickers = [...new Set(live.map((p) => p.condition.ticker))];
  const prices = tickers.length ? await deps.priceFor(tickers) : {};

  // 3. Fire, notify, exit.
  let index = 0;
  for (const plan of live) {
    if (over()) break;
    index++;
    const now = deps.now();
    const price = prices[plan.condition.ticker];
    if (!(price > 0)) {
      await deps.savePlan(plan.id, { evaluatedAt: now, log: plan.log });
      continue;
    }
    const c = plan.condition;
    if (plan.execution === "trigger") {
      // Jupiter's keeper owns these; only the expiry check above applies.
      await deps.savePlan(plan.id, { evaluatedAt: now, log: plan.log });
      continue;
    }
    if (plan.status === "armed" && met(c.trigger, price)) {
      if (plan.execution === "server") {
        try {
          const quantity = c.action.side === "sell" ? await sellQuantity(deps, plan) : undefined;
          const input: PracticeFillInput = {
            ticker: c.ticker,
            side: c.action.side,
            ...(c.action.side === "buy" && "amountUsd" in c.action ? { amountUsd: c.action.amountUsd } : {}),
            ...(c.action.side === "buy" && "shares" in c.action ? { quantity: c.action.shares } : {}),
            ...(c.action.side === "sell" ? { quantity } : {}),
            note: c.note,
            wrongIf: c.wrongIf,
            leg: c.leg,
            via: "plan",
            planId: plan.id,
          };
          const fill = await deps.fillPractice(plan.owner, input);
          const next: PlanStatus = c.action.side === "buy" && c.exits.length > 0 ? "holding" : "done";
          await deps.savePlan(plan.id, {
            status: next,
            filled: { price: fill.pricePerShare, shares: fill.quantity, at: now, fillId: fill.fillId },
            evaluatedAt: now,
            log: log(plan, next, `filled ${fill.quantity.toFixed(4)} ${c.ticker} at ${money(fill.pricePerShare)}`, now),
          });
          await deps.inbox({ owner: plan.owner, kind: "plan_filled", planId: plan.id, title: `Plan filled: ${c.ticker}`, body: `${c.action.side === "buy" ? "Bought" : "Sold"} ${fill.quantity.toFixed(4)} ${c.ticker} at ${money(fill.pricePerShare)} (practice).`, href: "/portfolio" });
          result.fired++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "fill failed";
          await deps.savePlan(plan.id, { status: "failed", evaluatedAt: now, log: log(plan, "failed", msg, now) });
          await deps.inbox({ owner: plan.owner, kind: "plan_failed", planId: plan.id, title: `Plan failed: ${c.ticker}`, body: msg, href: "/portfolio" });
          result.failed++;
        }
      } else if (plan.execution === "notify") {
        await deps.savePlan(plan.id, { status: "ready", readyAt: now, evaluatedAt: now, log: log(plan, "ready", `condition met at ${money(price)}; waiting for your signature`, now) });
        await deps.inbox({ owner: plan.owner, kind: "plan_ready", planId: plan.id, title: `Ready to sign: ${c.ticker}`, body: `${plan.summary}. ${c.ticker} is at ${money(price)}.`, href: `/buy/${c.ticker}?plan=${plan.id}` });
        result.notified++;
      }
      continue;
    }
    if (plan.status === "ready" && c.trigger.kind === "price" && !met(c.trigger, price)) {
      // The price moved away while nobody signed: re-arm after 30 minutes so a stale "ready" never lingers.
      if (plan.readyAt !== null && now - plan.readyAt > 30 * 60_000) {
        await deps.savePlan(plan.id, { status: "armed", readyAt: null, evaluatedAt: now, log: log(plan, "armed", "price moved away; re-armed", now) });
      } else await deps.savePlan(plan.id, { evaluatedAt: now, log: plan.log });
      continue;
    }
    if (plan.status === "holding" && plan.filled) {
      const hit = exitHit(c.exits, price);
      if (!hit) {
        await deps.savePlan(plan.id, { evaluatedAt: now, log: plan.log });
        continue;
      }
      if (plan.execution === "server") {
        try {
          const held = await deps.heldShares(plan.owner, c.ticker);
          const quantity = Math.min(held, plan.filled.shares);
          if (!(quantity > 0)) throw new Error("Nothing left to sell; the position was closed elsewhere.");
          const fill = await deps.fillPractice(plan.owner, { ticker: c.ticker, side: "sell", quantity, via: "plan", planId: plan.id, note: c.note });
          await deps.savePlan(plan.id, { status: "done", evaluatedAt: now, log: log(plan, "done", `${hit.kind} ${money(hit.price)} hit; sold ${fill.quantity.toFixed(4)} at ${money(fill.pricePerShare)}`, now) });
          await deps.inbox({ owner: plan.owner, kind: "plan_filled", planId: plan.id, title: `${hit.kind === "target" ? "Target" : "Stop"} hit: ${c.ticker}`, body: `Sold ${fill.quantity.toFixed(4)} ${c.ticker} at ${money(fill.pricePerShare)} (practice).`, href: "/portfolio" });
          result.exited++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "exit failed";
          await deps.savePlan(plan.id, { status: "failed", evaluatedAt: now, log: log(plan, "failed", msg, now) });
          await deps.inbox({ owner: plan.owner, kind: "plan_failed", planId: plan.id, title: `Exit failed: ${c.ticker}`, body: msg, href: "/portfolio" });
          result.failed++;
        }
      } else {
        await deps.savePlan(plan.id, { status: "ready", readyAt: now, evaluatedAt: now, log: log(plan, "ready", `${hit.kind} ${money(hit.price)} hit; waiting for your signature`, now) });
        await deps.inbox({ owner: plan.owner, kind: "plan_ready", planId: plan.id, title: `Ready to sign: sell ${c.ticker}`, body: `${hit.kind === "target" ? "Target" : "Stop"} ${money(hit.price)} hit at ${money(price)}.`, href: `/buy/${c.ticker}?plan=${plan.id}&side=sell` });
        result.notified++;
      }
      continue;
    }
    await deps.savePlan(plan.id, { evaluatedAt: now, log: plan.log });
  }
  result.remaining = Math.max(0, live.length - index);
  result.ms = deps.now() - started;
  return result;
}
