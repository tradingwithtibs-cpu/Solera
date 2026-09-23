"use client";

import { Panel } from "@/components/panels/Panel";

/** Holds the Plans slot until the Plans card lands (docs/port/plan.md task A2). */
export function PlansPanel({ id }: { id: string }) {
  return (
    <Panel id={id} title="Plans" subtitle="standing orders in plain words">
      <div className="empty-state">
        <h2>Plans arrive with the Agent.</h2>
        <p>
          A standing order in plain words, like “if TSLAx falls to 370, buy $250”, that Solera reads, shows you the rule it understood, and only arms when
          you say so.
        </p>
      </div>
    </Panel>
  );
}
