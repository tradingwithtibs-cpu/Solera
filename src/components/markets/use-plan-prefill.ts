"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "@/hooks/use-session";
import { plansClient } from "@/lib/plans-client";
import type { Plan } from "@/lib/plans";
import type { TradeSide } from "@/lib/types";

export interface PlanPrefill {
  /** Changes when a different prefill arrives; the ticket applies each key once. */
  key: string;
  source: "plan" | "agent";
  side?: TradeSide;
  /** Dollars. */
  amount?: number;
  shares?: number;
  /** Of the position, for sells (0 < fraction ≤ 1). */
  fraction?: number;
  note?: string;
  /** The plan behind a `?plan=` link, for the banner and the done PATCH. */
  plan?: Plan;
}

function num(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** What a plan's condition asks the ticket to prefill (agent-ux §3.3 step 3). */
export function prefillFromPlan(plan: Plan): PlanPrefill {
  const a = plan.condition.action;
  return {
    key: `plan:${plan.id}`,
    source: "plan",
    side: a.side,
    amount: "amountUsd" in a ? a.amountUsd : undefined,
    shares: "shares" in a ? a.shares : undefined,
    fraction: "fraction" in a ? a.fraction : undefined,
    note: plan.condition.note,
    plan,
  };
}

// The agent's order card (`?side=&amount=&shares=&note=&via=agent`) is read
// straight off the URL: no fetch, and no useSearchParams, so the ticket
// inside the markets grid needs no extra Suspense boundary.
let lastSearch: string | null = null;
let lastParsed: PlanPrefill | null = null;

function agentPrefill(): PlanPrefill | null {
  const search = window.location.search;
  if (search === lastSearch) return lastParsed;
  lastSearch = search;
  const p = new URLSearchParams(search);
  if (p.get("via") !== "agent") {
    lastParsed = null;
    return null;
  }
  const rawSide = p.get("side");
  lastParsed = {
    key: `agent:${search}`,
    source: "agent",
    side: rawSide === "sell" ? "sell" : rawSide === "buy" ? "buy" : undefined,
    amount: num(p.get("amount")),
    shares: num(p.get("shares")),
    note: p.get("note")?.slice(0, 280) || undefined,
  };
  return lastParsed;
}

function subscribeUrl(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

/**
 * What a `/buy/<ticker>?plan=<id>` link prefills in the ticket: the plan is
 * read with the session token (`GET /api/plans/:id`) and its side, size and
 * note come back with the plan itself for the banner. Without a plan id,
 * the agent's order-card params prefill directly. Null until known; the
 * ticket applies a prefill once per key, so typing is never overwritten.
 */
export function usePlanPrefill(planId: string | null | undefined): PlanPrefill | null {
  const { token } = useSession();
  const fromUrl = useSyncExternalStore(subscribeUrl, agentPrefill, () => null);
  const [fromPlan, setFromPlan] = useState<{ id: string; prefill: PlanPrefill } | null>(null);

  useEffect(() => {
    if (!planId || !token) return;
    let cancelled = false;
    plansClient
      .get(token, planId)
      .then((plan) => {
        if (!cancelled) setFromPlan({ id: planId, prefill: prefillFromPlan(plan) });
      })
      .catch(() => {
        // Unknown, expired or someone else's plan: nothing is prefilled; the id still rides on the fill.
      });
    return () => {
      cancelled = true;
    };
  }, [planId, token]);

  if (planId) return fromPlan && fromPlan.id === planId ? fromPlan.prefill : null;
  return fromUrl;
}
