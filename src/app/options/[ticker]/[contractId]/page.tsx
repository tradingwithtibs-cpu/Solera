import { Suspense } from "react";
import { OptionsTradeScreen } from "@/components/OptionsTradeScreen";

export default function OptionsBuyPage() {
  return (
    <Suspense fallback={null}>
      <OptionsTradeScreen />
    </Suspense>
  );
}
