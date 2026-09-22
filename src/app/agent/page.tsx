"use client";

import { PanelGrid } from "@/components/panels/PanelGrid";
import { Panel } from "@/components/panels/Panel";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";

/** Placeholder until the Agent tab lands (docs/port/plan.md task A4); already on the panel grid. */
export default function AgentPage() {
  return (
    <>
      <PanelGrid page="agent" phoneTab="agent">
        <Panel id="agent" title="Agent" subtitle="arrives with the port">
          <div className="empty-state">
            <h2>The Agent arrives with the port.</h2>
            <p>Plain-English plans, news on any ticker, and practice orders you confirm with one tap. Until then, the rest of Solera is live.</p>
          </div>
        </Panel>
        <Panel id="plans" title="Plans" subtitle="standing orders in plain words">
          <p className="muted p-2 text-xs">No plans yet. Once the Agent is here, a sentence like &ldquo;buy AAPLx if it goes over $345&rdquo; becomes one.</p>
        </Panel>
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="agent" />
      </p>
    </>
  );
}
