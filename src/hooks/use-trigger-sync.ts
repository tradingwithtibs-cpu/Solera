"use client";

import { useEffect } from "react";
import { getTriggerClient } from "@/lib/jupiter-trigger";
import type { Plan } from "@/lib/plans";
import { plansClient } from "@/lib/plans-client";

const SYNC_MS = 60_000;

/**
 * Mirrors Jupiter's order state onto trigger plans (backend §9.7): only
 * while a JWT for the connected wallet is cached in this tab, every 60 s.
 * Without a token nothing is called and rows keep their last known state;
 * the panel offers REFRESH · SIGN IN WITH WALLET for that case.
 */
export async function syncTriggerStates(plans: Plan[], wallet: string, sessionToken: string): Promise<number> {
  const client = getTriggerClient();
  const token = client.cachedToken(wallet);
  if (!token) return 0;
  const mine = plans.filter((p) => p.execution === "trigger" && p.triggerOrderId && p.wallet === wallet && (p.status === "armed" || p.status === "holding" || p.status === "ready"));
  if (mine.length === 0) return 0;
  const [active, past] = await Promise.all([client.listOrders(token, "active", 50), client.listOrders(token, "past", 50)]);
  const byId = new Map<string, string>();
  for (const o of [...active.orders, ...past.orders]) byId.set(o.id, String(o.orderState));
  let changed = 0;
  for (const plan of mine) {
    const state = byId.get(plan.triggerOrderId!);
    if (!state || state === plan.triggerState) continue;
    try {
      await plansClient.syncTrigger(sessionToken, plan.id, state);
      changed++;
    } catch {
      // The next pass tries again.
    }
  }
  return changed;
}

/** Runs the sync on mount and every minute while `plans` has trigger rows for `wallet`. `onChanged` refetches the list. */
export function useTriggerSync(plans: Plan[], wallet: string | null, sessionToken: string | null, onChanged?: () => void) {
  const hasTrigger = plans.some((p) => p.execution === "trigger" && p.triggerOrderId);
  useEffect(() => {
    if (!wallet || !sessionToken || !hasTrigger) return;
    let cancelled = false;
    const run = () =>
      syncTriggerStates(plans, wallet, sessionToken)
        .then((n) => {
          if (!cancelled && n > 0) onChanged?.();
        })
        .catch(() => {});
    run();
    const timer = setInterval(run, SYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // plans identity changes on every refetch; the trigger rows' ids are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, sessionToken, hasTrigger, plans.map((p) => p.triggerOrderId).join(",")]);
}
