import { notFound } from "next/navigation";
import { INVESTORS } from "@/lib/mock-data";
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

export default async function InvestorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = INVESTORS.find((i) => i.id === id);
  if (!investor) notFound();

  const holdings = computeHoldings(investor.holdings);
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar heading={false} title={investor.handle} />

      <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-2 text-center">
        <Avatar initials={investor.initials} colorClass={investor.avatarColor} size="lg" />
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{investor.name}</h1>
          <p className="text-sm text-neutral-400">{investor.handle}</p>
        </div>
        <p className="max-w-xs text-sm text-neutral-500">{investor.bio}</p>
        <div className="flex items-center gap-2 pt-1">
          <PerformanceBadge value={investor.performancePct} />
          <span className="text-xs text-neutral-400">this month</span>
          <OnChainBadge walletAddress={investor.walletAddress} />
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
