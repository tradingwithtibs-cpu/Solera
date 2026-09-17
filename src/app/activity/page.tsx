"use client";
import { LoadingState } from "@/components/LoadingState";

import Link from "next/link";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { TopBar } from "@/components/TopBar";
import { TransactionRow } from "@/components/TransactionRow";

export default function ActivityPage() {
  const { transactions, isLoaded } = useActivePortfolio();

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="Activity" />

      {!isLoaded ? (
        <LoadingState />
      ) : transactions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
          <p className="text-sm font-semibold text-neutral-900">No trades yet</p>
          <p className="text-sm text-neutral-400">
            Buy from your{" "}
            <Link href="/portfolio" className="font-semibold text-violet-600">
              portfolio
            </Link>{" "}
            or copy a holding from the feed to get started.
          </p>
        </div>
      ) : (
        <div className="flex-1 divide-y divide-neutral-100 px-5 pb-6">
          {transactions.map((t) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      )}
    </div>
  );
}
