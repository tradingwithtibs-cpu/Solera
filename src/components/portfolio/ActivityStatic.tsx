"use client";

import "./portfolio.css";
import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { TransactionRow } from "@/components/TransactionRow";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { usePortfolio } from "@/hooks/use-portfolio";
import { ArrowLeftIcon } from "@/components/icons";

/** One full-width slot in the grid's own CSS: the row unit becomes auto so the card takes its content height. */
const SINGLE_SLOT = { "--grid-row": "auto", "--col": 1, "--row": 1, "--w": 12, "--h": 1 } as React.CSSProperties;

type Ledger = "onchain" | "practice";

/**
 * Every fill, newest first, with its note. Practice mode lists the
 * practice ledger; live mode lists the wallet's on-chain fills made
 * through Solera, with the practice ledger a segment away.
 */
export function ActivityStatic() {
  const active = useActivePortfolio();
  const practice = usePortfolio();
  const isLive = active.mode === "live";
  const [ledger, setLedger] = useState<Ledger>("onchain");
  const showPractice = isLive && ledger === "practice";
  const transactions = showPractice ? practice.transactions : active.transactions;
  const isLoaded = showPractice ? practice.isLoaded : active.isLoaded;
  const count = transactions.length;

  return (
    <section className="panel-grid" style={SINGLE_SLOT}>
      <Panel
        static
        title="Recent fills"
        subtitle={isLoaded ? `${count} ${count === 1 ? "fill" : "fills"} · ${showPractice || !isLive ? "practice" : "live"}` : undefined}
        tools={
          <>
            {isLive && (
              <div className="seg" role="group" aria-label="Which ledger">
                <button type="button" aria-pressed={ledger === "practice"} onClick={() => setLedger("practice")}>
                  Practice
                </button>
                <button type="button" aria-pressed={ledger === "onchain"} onClick={() => setLedger("onchain")}>
                  On-chain
                </button>
              </div>
            )}
            <Link href="/portfolio" className="btn-ghost btn-small" aria-label="Back to portfolio">
              <ArrowLeftIcon className="h-4 w-4" />
              Portfolio
            </Link>
          </>
        }
      >
        {!isLoaded ? (
          <div className="pf-skeleton" role="status" aria-label="Loading your fills" aria-busy="true">
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        ) : count === 0 ? (
          <div className="empty-state">
            <h2>No trades yet</h2>
            <p>
              Buy from your{" "}
              <Link href="/portfolio" className="text-accent-text underline underline-offset-[3px]">
                portfolio
              </Link>{" "}
              or copy a holding from the feed to get started.
            </p>
          </div>
        ) : (
          <div className="pf-fills">
            {transactions.map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
