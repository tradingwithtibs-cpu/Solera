"use client";

import Link from "next/link";
import { COMPANIES } from "@/lib/pre-ipo";
import { useNow } from "@/components/portfolio/use-now";
import type { AgentCard } from "@/lib/agent/types";
import { relativeAge } from "./helpers";

type NewsCardData = Extract<AgentCard, { kind: "news" }>;
const ROWS = 8;

/**
 * The NEWS CARD (agent-ux §1.5): the headlines the get_news tool returned,
 * verbatim, each an outbound link with its source and age. The card is the
 * source of truth; the bubble may only quote it.
 */
export function NewsCard({ card }: { card: NewsCardData }) {
  const now = useNow();
  const label = card.ticker ?? (card.company ? COMPANIES[card.company].name : "the market");
  const href = card.ticker ? `/asset/${encodeURIComponent(card.ticker)}` : "/pre-ipo";
  const source = card.source === "finnhub" ? "Finnhub" : "Google News";
  const items = card.items.slice(0, ROWS);
  return (
    <section className="agent-card news" aria-label={`${label} in the news`}>
      <header className="agent-card-head">
        <h3>
          {label} in the news · {source}
        </h3>
      </header>
      <div className="agent-card-body">
        {items.length === 0 ? (
          <p className="agent-line">No recent headlines for {label}.</p>
        ) : (
          <ul className="agent-news">
            {items.map((n) => (
              <li key={n.id}>
                <a href={n.url} target="_blank" rel="noreferrer noopener">
                  {n.headline} ↗
                </a>
                <small>
                  {n.source}
                  {now ? ` · ${relativeAge(n.publishedAt, now)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
        <div className="agent-actions">
          <Link className="btn-secondary btn-small" href={href}>
            open {label}
          </Link>
        </div>
      </div>
    </section>
  );
}
