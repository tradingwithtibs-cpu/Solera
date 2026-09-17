"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { NewsList } from "@/components/NewsList";
import { TICKER_LIST } from "@/lib/mock-data";
import { COMPANIES } from "@/lib/pre-ipo";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { PRE_IPO_MINTS } from "@/lib/pre-ipo";

type View = "markets" | "holdings" | "preipo";

/**
 * The full news feed. "Your holdings" follows whatever the active portfolio
 * holds — real wallet tokens in live mode, practice positions otherwise —
 * so it's news about what the user actually owns.
 */
export default function NewsPage() {
  const [view, setView] = useState<View>("markets");
  const { holdings, preIpoHoldings, isLoaded } = useActivePortfolio();
  const heldTickers = holdings.map((h) => h.ticker);
  const heldCompanies = [...new Set(Object.keys(preIpoHoldings).map((m) => PRE_IPO_MINTS[m]?.company).filter(Boolean))];

  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <p className="eyebrow">What moved, and why</p>
        <h1>
          News<span className="text-violet-500">.</span>
        </h1>
        <p>Coverage of the companies behind every token here.</p>
      </header>
      <div className="space-y-5 px-5 pb-6 sm:px-7">
        <SegmentedControl
          label="News view"
          value={view}
          onChange={setView}
          options={[
            { value: "markets", label: "Markets" },
            { value: "holdings", label: "Your holdings" },
            { value: "preipo", label: "Pre-IPO" },
          ]}
        />

        {view === "markets" && <NewsList scope={{ kind: "general" }} />}

        {view === "holdings" &&
          (!isLoaded ? null : heldTickers.length + heldCompanies.length === 0 ? (
            <p className="text-sm text-neutral-400">Nothing held yet. Buy something and its news shows up here.</p>
          ) : (
            <div className="space-y-6">
              {heldTickers.map((ticker) => (
                <section key={ticker}>
                  <h2 className="mb-1 text-sm font-semibold text-neutral-900">
                    {TICKER_LIST.find((t) => t.symbol === ticker)?.name} <span className="text-neutral-400">· {ticker}</span>
                  </h2>
                  <NewsList scope={{ kind: "ticker", ticker }} limit={4} />
                </section>
              ))}
              {heldCompanies.map((company) => (
                <section key={company}>
                  <h2 className="mb-1 text-sm font-semibold text-neutral-900">{COMPANIES[company].name}</h2>
                  <NewsList scope={{ kind: "company", company }} limit={4} />
                </section>
              ))}
            </div>
          ))}

        {view === "preipo" && (
          <div className="space-y-6">
            {Object.values(COMPANIES).map((c) => (
              <section key={c.id}>
                <h2 className="mb-1 text-sm font-semibold text-neutral-900">
                  {c.name} <span className="text-neutral-400">· {c.sector}</span>
                </h2>
                <NewsList scope={{ kind: "company", company: c.id }} limit={3} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
