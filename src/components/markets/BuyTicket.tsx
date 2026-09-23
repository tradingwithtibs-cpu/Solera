"use client";

import "./markets.css";
import { useSearchParams } from "next/navigation";
import { Panel } from "@/components/panels/Panel";
import { getCatalogToken, getTickerInfo, isFeatured, isKnownTicker } from "@/lib/catalog";
import { useCatalog } from "@/hooks/use-catalog";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { useLivePriceFor } from "@/hooks/use-live-price-for";
import { COMPANIES } from "@/lib/pre-ipo";
import { BackLink } from "./BackLink";
import { TradeTicket } from "./TradeTicket";

/**
 * `/buy/[ticker]`: the ticket full width in a static panel. Keeps every
 * existing entry point: `?side=sell` from a holding, `?ref=` from Copy on
 * an investor, `?plan=` from a notify link, and the iOS wallet return.
 */
export function BuyTicket({ ticker }: { ticker: string }) {
  const params = useSearchParams();
  const side = params.get("side") === "sell" ? "sell" : "buy";
  const ref = params.get("ref");
  const plan = params.get("plan");
  const { isLoaded: catalogLoaded } = useCatalog();
  const { tokens, isLoaded: preIpoLoaded } = usePreIpo();
  const xstock = isKnownTicker(ticker) && (isFeatured(ticker) || !!getCatalogToken(ticker));
  const preIpo = xstock ? undefined : tokens.find((t) => t.symbol === ticker || t.mint === ticker);
  useLivePriceFor(xstock ? ticker : undefined);
  const name = xstock ? getTickerInfo(ticker).name : preIpo ? COMPANIES[preIpo.company].name : undefined;
  const known = xstock || !!preIpo;

  return (
    <div className="panel-grid single">
      <Panel static title={`${side === "sell" ? "Sell" : "Buy"} ${known ? ticker : "asset"}`} subtitle={name} tools={<BackLink />}>
        {xstock ? (
          <TradeTicket target={{ kind: "xstock", ticker }} initialSide={side} refInvestorId={ref} planId={plan} />
        ) : preIpo ? (
          <TradeTicket target={{ kind: "pre-ipo", token: preIpo }} initialSide="buy" planId={plan} />
        ) : !catalogLoaded || !preIpoLoaded ? (
          <p className="asset-note" aria-busy="true">
            Loading the catalog…
          </p>
        ) : (
          <div className="empty-state">
            <h2>We couldn&apos;t find that asset.</h2>
            <p>Pick one from Markets.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}
