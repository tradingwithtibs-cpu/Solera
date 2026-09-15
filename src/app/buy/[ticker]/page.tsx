import { Suspense } from "react";
import { TradeScreen } from "@/components/TradeScreen";

export default function BuyPage() {
  return (
    <Suspense fallback={null}>
      <TradeScreen />
    </Suspense>
  );
}
