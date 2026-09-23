"use client";

import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { TransactionRow } from "@/components/TransactionRow";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";

const RECENT_LIMIT = 5;

/** The last five fills from the active ledger, each with its note. */
export function FillsPanel({ id }: { id: string }) {
  const { transactions, isLoaded } = useActivePortfolio();
  const recent = transactions.slice(0, RECENT_LIMIT);
  return (
    <Panel
      id={id}
      title="Recent fills"
      tools={
        <Link href="/activity" className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-text hover:text-fg">
          See all →
        </Link>
      }
    >
      {!isLoaded ? (
        <div className="pf-skeleton" role="status" aria-label="Loading your fills" aria-busy="true">
          <div className="skeleton h-12 w-full" />
        </div>
      ) : recent.length === 0 ? (
        <p className="pf-empty-line">No trades yet.</p>
      ) : (
        <div className="pf-fills">
          {recent.map((t) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      )}
    </Panel>
  );
}
