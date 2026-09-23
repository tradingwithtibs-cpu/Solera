"use client";

import type { TradeSide } from "@/lib/types";

export interface PlanPrefill {
  side?: TradeSide;
  amount?: number;
  note?: string;
}

/**
 * What a `/buy/<ticker>?plan=<id>` link prefills in the ticket. The Plans UI
 * (task A2) replaces this with a read of the plan; until then nothing is
 * prefilled and the id only rides along on the fill as `planId`.
 */
export function usePlanPrefill(planId: string | null | undefined): PlanPrefill | null {
  void planId;
  return null;
}
