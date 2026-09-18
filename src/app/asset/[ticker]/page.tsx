import { AssetModeSection } from "@/components/AssetModeSection";
import { notFound } from "next/navigation";
import { TICKERS } from "@/lib/mock-data";
import type { TickerSymbol } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { TickerBadge } from "@/components/TickerBadge";
import { AssetPriceChart } from "@/components/AssetPriceChart";
import { OwnedPumpingBadge } from "@/components/OwnedPumpingBadge";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { EffectivePriceDisplay } from "@/components/EffectivePriceDisplay";
import { NewsList } from "@/components/NewsList";

export default async function AssetDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: symbol } = await params;
  const ticker = TICKERS[symbol as TickerSymbol];
  if (!ticker) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        heading={false}
        title={ticker.symbol}
        action={<WatchlistStarButton ticker={ticker.symbol} size="sm" />}
      />

      <div className="flex flex-col items-center gap-1 px-5 pb-2 pt-2 text-center">
        <TickerBadge ticker={ticker} size="lg" />
        <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-1.5 px-4">
          <h1 className="min-w-0 truncate text-base font-semibold text-neutral-900">
            {ticker.name} <span className="text-neutral-400">· {ticker.symbol}</span>
          </h1>
          <OwnedPumpingBadge ticker={ticker.symbol} />
        </div>
        <EffectivePriceDisplay ticker={ticker.symbol} />
        <AssetPriceChart ticker={ticker.symbol} color={ticker.color} />
      </div>

      <AssetModeSection ticker={ticker.symbol} />

      <section className="mx-5 mb-6 mt-2 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">{ticker.name} news</h2>
        <p className="mb-1 text-xs text-neutral-400">Last 7 days, about the listed company behind {ticker.symbol}.</p>
        <NewsList scope={{ kind: "ticker", ticker: ticker.symbol }} limit={5} />
      </section>
    </div>
  );
}
