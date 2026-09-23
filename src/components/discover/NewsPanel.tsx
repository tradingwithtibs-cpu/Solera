"use client";

import "./discover.css";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Panel } from "@/components/panels/Panel";
import { useNewsScopes, type FeedNews, type NewsScope } from "@/hooks/use-news";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { getTickerInfo } from "@/lib/catalog";
import { COMPANIES, PRE_IPO_MINTS, type CompanyId } from "@/lib/pre-ipo";
import { ArrowLeftIcon } from "@/components/icons";
import { NewsRow } from "./NewsRow";
import { StorySheet } from "./StorySheet";

type View = "markets" | "holdings" | "preipo";

const VIEWS: { key: View; label: string }[] = [
  { key: "markets", label: "Markets" },
  { key: "holdings", label: "Your holdings" },
  { key: "preipo", label: "Pre-IPO" },
];

/**
 * /news: every headline, grouped as today — Markets, one section per held
 * ticker or company, one per pre-IPO company. Static card, the same rows
 * as Discover.
 */
export function NewsPanel() {
  const [view, setView] = useState<View>("markets");
  const [open, setOpen] = useState<FeedNews | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const { holdings, preIpoHoldings, isLoaded } = useActivePortfolio();
  const heldTickers = holdings.map((h) => h.ticker);
  const heldCompanies = [...new Set(Object.keys(preIpoHoldings).map((m) => PRE_IPO_MINTS[m]?.company).filter(Boolean))];

  const tools = (
    <>
      <div className="feed-tools">
        <div className="seg" role="group" aria-label="News view">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <Link href="/" className="btn btn-ghost btn-small" aria-label="Back to Discover">
        <ArrowLeftIcon className="h-4 w-4" />
        Discover
      </Link>
    </>
  );

  const sections: { key: string; heading: string; sub?: string; scope: NewsScope }[] =
    view === "markets"
      ? [{ key: "general", heading: "Markets", sub: "what moved, and why", scope: { kind: "general" } }]
      : view === "holdings"
        ? [
            ...heldTickers.map((ticker) => ({ key: ticker, heading: getTickerInfo(ticker).name, sub: ticker, scope: { kind: "ticker" as const, ticker } })),
            ...heldCompanies.map((company) => ({ key: company, heading: COMPANIES[company].name, sub: "pre-ipo", scope: { kind: "company" as const, company } })),
          ]
        : Object.values(COMPANIES).map((c) => ({ key: c.id, heading: c.name, sub: c.sector, scope: { kind: "company" as const, company: c.id } }));

  return (
    <div className="panel-static">
      <Panel static title="News" subtitle="headline · source · link, never the article" tools={tools} className="news-card" bodyClassName="news-body">
        {view === "holdings" && isLoaded && sections.length === 0 ? (
          <p className="news-inline-empty">Nothing held yet. Buy something and its news shows up here.</p>
        ) : (
          <div className="news-sections">
            {sections.map((s) => (
              <NewsSection key={s.key} heading={s.heading} sub={s.sub} scope={s.scope} held={heldTickers.includes(s.key) || heldCompanies.includes(s.key as CompanyId)} onOpen={setOpen} />
            ))}
          </div>
        )}
      </Panel>
      {open && <StorySheet item={open} onClose={close} />}
    </div>
  );
}

function NewsSection({ heading, sub, scope, held, onOpen }: { heading: string; sub?: string; scope: NewsScope; held: boolean; onOpen: (item: FeedNews) => void }) {
  const { items, isLoaded, error } = useNewsScopes([scope]);
  return (
    <section>
      <div className="news-section-head">
        <p className="eyebrow">
          {heading}
          {sub && <em> · {sub}</em>}
        </p>
      </div>
      {!isLoaded ? (
        <div className="feed-skeleton" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      ) : error ? (
        <p className="news-inline-empty">{error}</p>
      ) : items.length === 0 ? (
        <p className="news-inline-empty">No recent coverage.</p>
      ) : (
        <ul className="posts">
          {items.map((item) => (
            <NewsRow key={item.id} item={item} held={held} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
