"use client";

import { PlansPanel as SharedPlansPanel } from "@/components/plans/PlansPanel";

/** The portfolio grid's Plans slot: the shared Plans card from src/components/plans (docs/port/plan.md task A2). */
export function PlansPanel({ id }: { id: string }) {
  return <SharedPlansPanel id={id} />;
}
