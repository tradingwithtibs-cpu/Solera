"use client";

import "./markets.css";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PanelGrid } from "@/components/panels/PanelGrid";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { useMediaQuery } from "@/hooks/use-media";
import { computeHoldings } from "@/lib/portfolio";
import type { PhoneTab } from "@/lib/layout";
import { MarketsCard } from "./MarketsCard";
import { AssetCard } from "./AssetCard";
import { RoomCard } from "./RoomCard";
import type { MarketTab } from "./types";

const DEFAULT = "TSLAx";
const SYMBOL = /^[A-Za-z0-9.\-]{1,44}$/;

interface Props {
  /** From the `/asset/[ticker]` path: the initial selection. */
  selected?: string;
  phoneTab?: PhoneTab;
  initialTab?: MarketTab;
}

/**
 * The markets grid: the list, the selected asset with its ticket, and the
 * ticker's room. Selection is the shared `solera:selected-ticker` store,
 * mirrored to `?sym=` (a row click on desktop replaces the URL in place;
 * phones navigate to /asset/[ticker] instead). `/asset/[ticker]` on desktop
 * renders this same grid with the ticker selected. Must sit under Suspense
 * because it reads the search params.
 */
export function MarketsGrid({ selected, phoneTab = "markets", initialTab }: Props) {
  const params = useSearchParams();
  const fromQuery = params.get("sym");
  const [stored, setStored] = useSelectedTicker();
  const { holdings } = useActivePortfolio();
  const isPhone = useMediaQuery("(max-width: 767px)");
  // Default selection: the largest position, else the stored pick, else TSLAx.
  const largest = holdings.length > 0 ? computeHoldings(holdings)[0]?.ticker : undefined;
  const active = (fromQuery && SYMBOL.test(fromQuery) ? fromQuery : null) ?? selected ?? (stored !== DEFAULT ? stored : (largest ?? stored));

  useEffect(() => {
    if (active !== stored) setStored(active);
  }, [active, stored, setStored]);

  const select = useCallback(
    (symbol: string) => {
      setStored(symbol);
      window.history.replaceState(null, "", `/markets?sym=${encodeURIComponent(symbol)}`);
    },
    [setStored],
  );

  // A room can be subscribed once per page: on the phone's Trade tab the asset card carries it, everywhere else the room card does.
  const roomUnderAsset = isPhone && phoneTab === "trade";

  return (
    <>
      <PanelGrid page="markets" phoneTab={phoneTab}>
        <MarketsCard id="markets" selected={active} onSelect={select} initialTab={initialTab} />
        <AssetCard id="asset" symbol={active} phoneRoom={roomUnderAsset} />
        <RoomCard id="room" ticker={active} active={!roomUnderAsset} />
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="markets" />
      </p>
    </>
  );
}

/** What the route shows while the client grid (which needs the URL) is not up yet. */
export function MarketsGridFallback() {
  return (
    <section className="panel-grid" aria-busy="true" aria-label="Loading markets">
      <div className="panel skeleton" style={{ "--col": 1, "--row": 1, "--w": 4, "--h": 24 } as React.CSSProperties} />
      <div className="panel skeleton" style={{ "--col": 5, "--row": 1, "--w": 8, "--h": 24 } as React.CSSProperties} />
    </section>
  );
}
