import { Suspense } from "react";
import { MarketsGrid, MarketsGridFallback } from "@/components/markets/MarketsGrid";

/**
 * One asset. On desktop this is the markets grid with the ticker selected
 * (one saved layout for both routes); on phones the asset card alone, on
 * the Trade tab, with the room link beneath it.
 */
export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<MarketsGridFallback />}>
      <MarketsGrid selected={decodeURIComponent(ticker)} phoneTab="trade" />
    </Suspense>
  );
}
