"use client";

import { PanelGrid } from "@/components/panels/PanelGrid";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { PlansPanel } from "@/components/plans/PlansPanel";

/** The Agent tab (docs/port/agent-ux.md §1): the agent card beside the plans slot, on the panel grid. */
export default function AgentPage() {
  return (
    <>
      <PanelGrid page="agent" phoneTab="agent">
        <AgentPanel id="agent" />
        <PlansPanel id="plans" />
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="agent" />
      </p>
    </>
  );
}
