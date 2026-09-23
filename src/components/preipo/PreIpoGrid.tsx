"use client";

import "./preipo.css";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PanelGrid } from "@/components/panels/PanelGrid";
import { Panel } from "@/components/panels/Panel";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { CompanyComparisonCard, PreIpoRow } from "@/components/PreIpo";
import { PreIpoBuySheet } from "@/components/PreIpoBuySheet";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { useMediaQuery } from "@/hooks/use-media";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { COMPANIES, compareAcrossIssuers, type Issuer, type PreIpoToken } from "@/lib/pre-ipo";
import type { TickerSymbol } from "@/lib/types";
import { PreIpoAssetCard } from "./PreIpoAssetCard";

/** The one sentence that must stay on every pre-IPO surface, verbatim. */
export const PRE_IPO_DISCLOSURE =
  "Token prices from Jupiter. Mark prices and valuations are published by each issuer from private secondary-market deals. Pre-IPO tokens are not shares: PreStocks tokens track SPV exposure, Tessera T-Tokens are loan participation rights. Not financial advice.";

type IssuerFilter = "all" | Issuer;

/**
 * The default selection: the first token of the first company sold by both
 * issuers, else the highest implied valuation. Never an xStock — the
 * partner build opened this page on TSLAx.
 */
function defaultToken(tokens: PreIpoToken[], comparisons: ReturnType<typeof compareAcrossIssuers>): PreIpoToken | undefined {
  if (comparisons[0]) return comparisons[0].tokens[0];
  return [...tokens].filter((t) => Number.isFinite(t.impliedValuation)).sort((a, b) => b.impliedValuation - a.impliedValuation)[0] ?? tokens[0];
}

/**
 * /pre-ipo as a panel grid: the pre-IPO market list, the selected token's
 * asset card with the ticket, and the two-issuer comparisons. Selection is
 * client state mirrored to ?sym= (or ?mint=) so a link opens on a token.
 */
export function PreIpoGrid() {
  const { tokens, sources, isLoaded, error } = usePreIpo();
  const params = useSearchParams();
  const isPhone = useMediaQuery("(max-width: 767px)");
  const { preIpoHoldings } = useActivePortfolio();
  const [chosenMint, setChosenMint] = useState<string | null>(null);
  const [issuer, setIssuer] = useState<IssuerFilter>("all");
  const [sheetToken, setSheetToken] = useState<PreIpoToken | null>(null);

  const comparisons = useMemo(() => compareAcrossIssuers(tokens), [tokens]);
  const symParam = params.get("sym");
  const mintParam = params.get("mint");
  const selected = useMemo(() => {
    const byChoice = chosenMint ? tokens.find((t) => t.mint === chosenMint) : undefined;
    const byMint = mintParam ? tokens.find((t) => t.mint === mintParam) : undefined;
    const bySym = symParam ? tokens.find((t) => t.symbol.toLowerCase() === symParam.toLowerCase()) : undefined;
    return byChoice ?? byMint ?? bySym ?? defaultToken(tokens, comparisons);
  }, [chosenMint, mintParam, symParam, tokens, comparisons]);

  const select = useCallback((token: PreIpoToken) => {
    setChosenMint(token.mint);
    try {
      window.history.replaceState(null, "", `/pre-ipo?sym=${encodeURIComponent(token.symbol)}`);
    } catch {
      // The URL mirror is a convenience; selection still works without it.
    }
  }, []);

  // Phones have no asset card on this tab: a row opens the buy sheet instead.
  const onRow = useCallback(
    (token: PreIpoToken) => {
      if (isPhone) setSheetToken(token);
      else select(token);
    },
    [isPhone, select],
  );

  const visible = useMemo(
    () => tokens.filter((t) => issuer === "all" || t.issuer === issuer).sort((a, b) => b.impliedValuation - a.impliedValuation),
    [tokens, issuer],
  );
  const comparisonFor = selected ? comparisons.find((c) => c.company.id === selected.company) : undefined;
  // The head has room for the issuer segment or a subtitle, not both: the count lives in the foot and the head only warns when a feed is down.
  const offline = sources ? [!sources.tessera && "Tessera feed offline", !sources.prestocks && "PreStocks feed offline"].filter(Boolean) : [];
  const marketsSubtitle = isLoaded && !error && offline.length > 0 ? offline.join(" · ") : undefined;
  const selectedCompany = selected ? COMPANIES[selected.company] : undefined;

  return (
    <>
      <PanelGrid page="preipo" phoneTab="markets">
        <Panel
          id="markets"
          title="Markets"
          subtitle={marketsSubtitle}
          tools={
            <div className="seg pi-issuer-seg" role="group" aria-label="Issuer">
              {(
                [
                  ["all", "All"],
                  ["PreStocks", "PreStocks"],
                  ["Tessera", "Tessera"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={issuer === value} onClick={() => setIssuer(value)}>
                  {label}
                </button>
              ))}
            </div>
          }
          bodyClassName="p-0!"
          foot={`prices live via Jupiter Price v3 · reference = issuer mark · ${tokens.length} pre-IPO tokens`}
        >
          {!isLoaded ? (
            <div className="pi-skeleton-rows" role="status" aria-label="Loading pre-IPO tokens">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          ) : error ? (
            <p className="p-3 text-xs text-loss" role="alert">
              {error}
            </p>
          ) : visible.length === 0 ? (
            <div className="empty-state m-3">
              <h2>Nothing from {issuer === "all" ? "either issuer" : issuer} right now.</h2>
              <p>Every token that is priced shows here as soon as the feed answers.</p>
            </div>
          ) : (
            <div className="rows">
              {visible.map((t) => (
                <PreIpoRow
                  key={t.mint}
                  token={t}
                  selected={!isPhone && selected?.mint === t.mint}
                  onSelect={onRow}
                  star={<WatchlistStarButton ticker={t.symbol as TickerSymbol} size="sm" />}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          id="asset"
          title={selected && selectedCompany ? `${selectedCompany.name} · ${selected.symbol}` : "Asset"}
          tools={selected ? <WatchlistStarButton ticker={selected.symbol as TickerSymbol} size="sm" /> : undefined}
        >
          {selected ? (
            <PreIpoAssetCard token={selected} comparison={comparisonFor} onSelect={select} held={preIpoHoldings[selected.mint]} />
          ) : !isLoaded ? (
            <div className="space-y-3" role="status" aria-label="Loading">
              <div className="skeleton h-12 rounded-[var(--radius-control)]" />
              <div className="skeleton h-24 rounded-[var(--radius-control)]" />
              <div className="skeleton h-20 rounded-[var(--radius-control)]" />
            </div>
          ) : (
            <div className="empty-state">
              <h2>{error ?? "No pre-IPO token to show yet."}</h2>
              <p>Pick a name in Markets once the issuer feeds answer.</p>
            </div>
          )}
        </Panel>

        <Panel id="compare" title="Same company, two issuers" subtitle="which token is cheaper changes as they trade" foot={PRE_IPO_DISCLOSURE}>
          {!isLoaded ? (
            <div className="pi-compare-grid" role="status" aria-label="Loading comparisons">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-40 rounded-[var(--radius-control)]" />
              ))}
            </div>
          ) : comparisons.length === 0 ? (
            <div className="empty-state">
              <h2>Only one issuer is answering right now, so there is nothing to compare.</h2>
              <p>Every token is still listed in Markets.</p>
            </div>
          ) : (
            <div className="pi-compare-grid">
              {comparisons.map((c) => (
                <CompanyComparisonCard key={c.company.id} comparison={c} />
              ))}
            </div>
          )}
        </Panel>
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="preipo" />
      </p>
      {sheetToken && <PreIpoBuySheet token={sheetToken} onClose={() => setSheetToken(null)} />}
    </>
  );
}
