import { AssetModeSection } from "@/components/AssetModeSection";
import { notFound } from "next/navigation";
import Link from "next/link";
import { INVESTORS, TICKERS } from "@/lib/mock-data";
import { computeHoldings } from "@/lib/portfolio";
import type { TickerSymbol } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { TickerBadge } from "@/components/TickerBadge";
import { AssetPriceChart } from "@/components/AssetPriceChart";
import { OwnedPumpingBadge } from "@/components/OwnedPumpingBadge";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { EffectivePriceDisplay } from "@/components/EffectivePriceDisplay";
import { ChatIcon } from "@/components/icons";

export default async function AssetDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: symbol } = await params;
  const ticker = TICKERS[symbol as TickerSymbol];
  if (!ticker) notFound();

  const holders = INVESTORS.map((investor) => ({
    investor,
    holding: computeHoldings(investor.holdings).find((h) => h.ticker === ticker.symbol),
  }))
    .filter(
      (
        entry,
      ): entry is { investor: (typeof INVESTORS)[number]; holding: NonNullable<typeof entry.holding> } =>
        entry.holding !== undefined,
    )
    .sort((a, b) => b.holding.allocationPct - a.holding.allocationPct);

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
        <Link
          href={`/asset/${ticker.symbol}/chat`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-600 active:bg-violet-100"
        >
          <ChatIcon className="h-3.5 w-3.5" />
          {ticker.symbol} chat
        </Link>
      </div>

      <AssetModeSection ticker={ticker.symbol} holders={holders} />
    </div>
  );
}
