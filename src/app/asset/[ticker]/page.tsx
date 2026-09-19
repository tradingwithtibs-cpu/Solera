"use client";

import { useParams } from "next/navigation";
import { AssetModeSection } from "@/components/AssetModeSection";
import { getCatalogToken, getTickerInfo, isFeatured, isKnownTicker, THIN_LIQUIDITY_USD } from "@/lib/catalog";
import { useCatalog } from "@/hooks/use-catalog";
import { useLivePriceFor } from "@/hooks/use-live-price-for";
import { TopBar } from "@/components/TopBar";
import { TickerBadge } from "@/components/TickerBadge";
import { AssetPriceChart } from "@/components/AssetPriceChart";
import { OwnedPumpingBadge } from "@/components/OwnedPumpingBadge";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { EffectivePriceDisplay } from "@/components/EffectivePriceDisplay";
import { NewsList } from "@/components/NewsList";
import { ChatRoomCard } from "@/components/ChatRoomCard";
import { LoadingState } from "@/components/LoadingState";
import { formatCompactUsd } from "@/lib/pre-ipo";

/**
 * One tokenized stock. Featured tickers render instantly; catalog tickers
 * resolve once the catalog has loaded and then poll their own price.
 */
export default function AssetDetailPage() {
  const { ticker: symbol } = useParams<{ ticker: string }>();
  const { isLoaded: catalogLoaded } = useCatalog();
  const known = isKnownTicker(symbol) && (isFeatured(symbol) || !!getCatalogToken(symbol));
  useLivePriceFor(known ? symbol : undefined);

  if (!known) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title={symbol} />
        {catalogLoaded ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-400">
            We couldn&apos;t find that asset.
          </div>
        ) : (
          <LoadingState />
        )}
      </div>
    );
  }

  const ticker = getTickerInfo(symbol);
  const catalog = getCatalogToken(symbol);
  const thin = !isFeatured(symbol) && (catalog?.liquidityUsd ?? 0) < THIN_LIQUIDITY_USD;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar heading={false} title={ticker.symbol} action={<WatchlistStarButton ticker={ticker.symbol} size="sm" />} />

      <div className="flex flex-col items-center gap-1 px-5 pb-2 pt-2 text-center">
        <TickerBadge ticker={ticker} size="lg" />
        <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-1.5 px-4">
          <h1 className="min-w-0 truncate text-base font-semibold text-neutral-900">
            {ticker.name} <span className="text-neutral-400">· {ticker.symbol}</span>
          </h1>
          <OwnedPumpingBadge ticker={ticker.symbol} />
        </div>
        <EffectivePriceDisplay ticker={ticker.symbol} />
        {catalog?.liquidityUsd !== undefined && !isFeatured(symbol) && (
          <p className={`text-xs ${thin ? "text-amber-600" : "text-neutral-400"}`}>
            {formatCompactUsd(catalog.liquidityUsd)} pool liquidity{thin ? " · thin market, expect slippage" : ""}
          </p>
        )}
        <AssetPriceChart ticker={ticker.symbol} color={ticker.color} />
      </div>

      <ChatRoomCard ticker={ticker.symbol} />

      <AssetModeSection ticker={ticker.symbol} />

      <section className="mx-5 mb-6 mt-2 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">{ticker.name} news</h2>
        <p className="mb-1 text-xs text-neutral-400">Last 7 days, about the listed company behind {ticker.symbol}.</p>
        <NewsList scope={{ kind: "ticker", ticker: ticker.symbol }} limit={5} />
      </section>
    </div>
  );
}
