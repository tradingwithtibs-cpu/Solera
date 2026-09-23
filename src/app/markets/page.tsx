import { Suspense } from "react";
import { MarketsGrid, MarketsGridFallback } from "@/components/markets/MarketsGrid";

/** Markets: the list, the selected asset with its ticket, the room. `?sym=` picks the asset. */
export default function MarketsPage() {
  return (
    <Suspense fallback={<MarketsGridFallback />}>
      <MarketsGrid />
    </Suspense>
  );
}
