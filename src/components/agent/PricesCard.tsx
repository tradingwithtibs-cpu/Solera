"use client";

import Link from "next/link";
import type { AgentCard } from "@/lib/agent/types";
import { money, utcClock } from "./helpers";

type PricesCardData = Extract<AgentCard, { kind: "prices" }>;

/** The PRICES CARD (agent-ux §1.5): `AAPLx $231.20` rows from get_prices, each opening the asset; `via Jupiter · 12:03:41Z`. */
export function PricesCard({ card }: { card: PricesCardData }) {
  const rows = Object.entries(card.prices).filter(([, p]) => typeof p === "number" && p > 0);
  return (
    <section className="agent-card prices" aria-label="Live prices">
      <header className="agent-card-head">
        <h3>
          PRICES
        </h3>
        <span className="agent-card-chips">
          <span className="agent-line">via Jupiter · {utcClock(card.fetchedAt)}</span>
        </span>
      </header>
      <div className="agent-card-body">
        {rows.length === 0 ? (
          <p className="agent-line">No live price right now.</p>
        ) : (
          <ul className="agent-prices">
            {rows.map(([ticker, p]) => (
              <li key={ticker}>
                <Link href={`/asset/${encodeURIComponent(ticker)}`}>
                  <span>{ticker}</span>
                  <span>{money(p)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
