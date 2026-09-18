"use client";

import { useState } from "react";
import Link from "next/link";
import { SegmentedControl } from "./SegmentedControl";
import { AssetPosition } from "./AssetPosition";
import { OptionsChain } from "./OptionsChain";
import { Avatar } from "./Avatar";
import { computeHoldings } from "@/lib/portfolio";
import { useInvestors } from "@/hooks/use-investors";
import { useTradeMode } from "@/hooks/use-trade-mode";
import type { TickerSymbol } from "@/lib/types";

type AssetMode = "shares" | "options";

/**
 * Shares/Options toggle for the asset page. Kept as one client component
 * (rather than two separate server-rendered sections) so switching modes
 * doesn't need a navigation — the "held by" list is server-computed and
 * passed in as a prop, since it only applies to the shares view.
 */
export function AssetModeSection({ ticker }: { ticker: TickerSymbol }) {
  const [mode, setMode] = useState<AssetMode>("shares");
  const { investors, source, isLoaded } = useInvestors();
  const { isLive } = useTradeMode();
  const holders = investors
    .map((investor) => ({ investor, holding: computeHoldings(investor.holdings).find((h) => h.ticker === ticker) }))
    .filter((e): e is { investor: (typeof investors)[number]; holding: NonNullable<typeof e.holding> } => !!e.holding)
    .sort((a, b) => b.holding.allocationPct - a.holding.allocationPct);

  return (
    <>
      {/* Options are a practice-only simulation; in live mode there's nothing real to show. */}
      {!isLive && (
        <div className="mx-5 mt-1">
          <SegmentedControl
            label="Instrument"
            value={mode}
            onChange={setMode}
            options={[
              { value: "shares", label: "Shares" },
              { value: "options", label: "Options · practice" },
            ]}
          />
        </div>
      )}

      {mode === "shares" || isLive ? (
        <>
          <div className="px-5 pb-1 pt-6">
            <h2 className="text-sm font-semibold text-neutral-900">Held by</h2>
            <p className="text-xs text-neutral-400">{source === "chain" ? `Largest wallets holding ${ticker} on Solana` : `Sample investors holding ${ticker}`}</p>
          </div>

          {!isLoaded ? (
            <p className="px-5 pb-6 text-xs text-neutral-400" aria-busy="true">Reading holders on Solana…</p>
          ) : holders.length === 0 ? (
            <p className="px-5 pb-6 text-xs text-neutral-400">No wallets to show for {ticker} yet.</p>
          ) : (
            <div className="flex-1 divide-y divide-neutral-100 px-5 pb-6">
              {holders.map(({ investor, holding }) => (
                <Link
                  key={investor.id}
                  href={`/investor/${investor.id}`}
                  className="flex items-center gap-3 py-4"
                >
                  <Avatar initials={investor.initials} colorClass={investor.avatarColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">{investor.name}</p>
                    <p className="truncate text-xs text-neutral-400">{investor.handle}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-medium text-neutral-500">
                    {holding.allocationPct.toFixed(0)}% of their portfolio
                  </span>
                </Link>
              ))}
            </div>
          )}

          <AssetPosition ticker={ticker} />
        </>
      ) : (
        <OptionsChain ticker={ticker} />
      )}
    </>
  );
}
