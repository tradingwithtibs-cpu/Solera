import { Suspense } from "react";
import { BuyTicket } from "@/components/markets/BuyTicket";

/** The ticket, full width: phones, `?ref=` copy links, notify links and the iOS wallet return. */
export default async function BuyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return (
    <Suspense fallback={null}>
      <BuyTicket ticker={decodeURIComponent(ticker)} />
    </Suspense>
  );
}
