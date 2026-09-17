"use client";

import { useParams } from "next/navigation";
import { useInvestor, useInvestors } from "@/hooks/use-investors";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import { TopBar } from "@/components/TopBar";
import { HoldingRow } from "@/components/HoldingRow";
import { FollowButton } from "@/components/FollowButton";
import { AllocationBar } from "@/components/AllocationBar";
import { SocialLinks } from "@/components/SocialLinks";
import { OnChainBadge } from "@/components/OnChainBadge";
import { LoadingState } from "@/components/LoadingState";

/**
 * An investor's profile: a real wallet (holdings straight from the chain,
 * identity unknown) or, before real data loads, a sample profile.
 */
export default function InvestorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { isLoaded } = useInvestors();
  const investor = useInvestor(id);

  if (!investor) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Investor" />
        {isLoaded ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-400">
            We couldn&apos;t find that investor.
          </div>
        ) : (
          <LoadingState />
        )}
      </div>
    );
  }

  const holdings = computeHoldings(investor.holdings);
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const isWallet = investor.kind === "wallet";

  return (
    <div className="flex flex-1 flex-col">
      <TopBar heading={false} title={investor.handle} />

      <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-2 text-center">
        <Avatar initials={investor.initials} colorClass={investor.avatarColor} size="lg" />
        <div>
          <h1 className="font-mono text-lg font-semibold text-neutral-900">{investor.name}</h1>
          <p className="text-sm text-neutral-400">{investor.handle}</p>
        </div>
        <p className="max-w-xs text-sm text-neutral-500">{investor.bio}</p>
        <div className="flex items-center gap-2 pt-1">
          <PerformanceBadge value={investor.performancePct} />
          <span className="text-xs text-neutral-400">{isWallet ? "7-day move of holdings" : "this month"}</span>
          <OnChainBadge walletAddress={investor.walletAddress} verified={isWallet} />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <FollowButton investorId={investor.id} size="md" />
          <SocialLinks socials={investor.socials} />
        </div>
      </div>

      <div className="border-t border-neutral-100 px-5 py-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Holdings</h2>
          <span className="font-mono text-xs text-neutral-400">{formatCurrency(totalValue)} total</span>
        </div>
        <div className="mt-3">
          <AllocationBar holdings={holdings} />
        </div>
      </div>

      <div className="flex-1 divide-y divide-neutral-100 px-5 pb-6">
        {holdings.map((h) => (
          <HoldingRow
            key={h.ticker}
            holding={h}
            actions={[{ label: "Copy", href: `/buy/${h.ticker}?ref=${investor.id}` }]}
          />
        ))}
      </div>
    </div>
  );
}
