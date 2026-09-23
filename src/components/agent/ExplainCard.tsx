"use client";

import type { AgentCard } from "@/lib/agent/types";

type ExplainCardData = Extract<AgentCard, { kind: "explain" }>;

/** The EXPLAIN CARD (agent-ux §1.5): describe() + status + the last log lines, preformatted. */
export function ExplainCard({ card }: { card: ExplainCardData }) {
  return (
    <section className="agent-card explain" aria-label="Plan explained">
      <header className="agent-card-head">
        <h3>
          PLAN · EXPLAINED
        </h3>
      </header>
      <div className="agent-card-body">
        <pre className="agent-pre">{card.text}</pre>
      </div>
    </section>
  );
}
