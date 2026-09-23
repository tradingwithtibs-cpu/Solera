"use client";

import "./people.css";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Panel } from "@/components/panels/Panel";
import { useInvestor, useInvestors } from "@/hooks/use-investors";
import { useProfile } from "@/hooks/use-profiles";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency, formatPercent } from "@/lib/format";
import { fillFor } from "@/lib/palette";
import { HoldingRow } from "@/components/HoldingRow";
import { AllocationStrip } from "./AllocationStrip";
import { FollowButton } from "@/components/FollowButton";
import { SocialLinks } from "@/components/SocialLinks";
import { OnChainBadge } from "@/components/OnChainBadge";
import { BackLink } from "./BackLink";
import { Verified } from "./Verified";
import { InvestorFills } from "./InvestorFills";

/**
 * /investor/[id] (pages.md §3.8): one real wallet as a static panel —
 * holdings straight from the chain, identity unknown unless a profile was
 * claimed, and the fills it made through Solera. Before real data loads,
 * a sample profile that says it is one.
 */
export function InvestorPanel({ id }: { id: string }) {
  const { isLoaded } = useInvestors();
  const investor = useInvestor(id);
  const isWallet = investor?.kind === "wallet";
  const profile = useProfile(isWallet ? investor.id : null);

  if (!investor) {
    return (
      <div className="people-static">
        <Panel static title="Investor" tools={<BackLink />}>
          {isLoaded ? (
            <div className="empty-state">
              <h2>We couldn&apos;t find that investor.</h2>
              <p>
                <Link href="/leaderboard" className="text-link underline underline-offset-4">
                  Back to People
                </Link>
              </p>
            </div>
          ) : (
            <div role="status" aria-busy="true" aria-label="Reading the largest wallets on Solana">
              <div className="skeleton person-skeleton" />
              <div className="skeleton person-skeleton" />
              <div className="skeleton person-skeleton" />
            </div>
          )}
        </Panel>
      </div>
    );
  }

  const holdings = computeHoldings(investor.holdings);
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  const claimed = isWallet && !!profile;
  const avatarStyle = { "--tk": fillFor(investor.avatarColor, investor.initials) } as CSSProperties;
  const move30 = investor.performance30dPct;

  return (
    <div className="people-static">
      <Panel
        static
        title={investor.name}
        subtitle={investor.handle}
        tools={<BackLink />}
        className="investor-panel prose-foot"
        foot={
          isWallet
            ? "Holdings are read live from public Solana data. Identity is unknown unless the wallet claimed a profile."
            : "A sample profile, shown while on-chain holders load. Nothing here is a real wallet."
        }
      >
        <header className="investor-head" data-holder={investor.id}>
          <span className="avatar lg" style={avatarStyle} aria-hidden="true">
            {investor.initials}
          </span>
          <div className="min-w-0">
            <h3 className="investor-name">
              <span>{investor.name}</span>
              {claimed && <Verified />}
            </h3>
            <p className="investor-handle">{investor.handle}</p>
            <p className="investor-bio">{investor.bio}</p>
            <div className="investor-meta">
              <span className={`chip ${investor.performancePct >= 0 ? "gain" : "loss"}`}>{formatPercent(investor.performancePct)}</span>
              <span>{isWallet ? "7-day move of holdings" : "this month"}</span>
              {isWallet && move30 !== undefined && (
                <>
                  <span className={`chip ${move30 >= 0 ? "gain" : "loss"}`}>{formatPercent(move30)}</span>
                  <span>30-day</span>
                </>
              )}
              <OnChainBadge walletAddress={investor.walletAddress} verified={isWallet} />
            </div>
            <div className="investor-actions">
              <FollowButton investorId={investor.id} name={investor.name} size="md" />
              <SocialLinks socials={investor.socials} />
            </div>
          </div>
        </header>

        <section className="investor-section" aria-labelledby="investor-holdings">
          <div className="investor-section-head">
            <p className="eyebrow" id="investor-holdings">
              Holdings
            </p>
            <span className="figure">
              {formatCurrency(total)} total · {holdings.length} {holdings.length === 1 ? "position" : "positions"}
            </span>
          </div>
          <AllocationStrip holdings={holdings} />
          {holdings.length === 0 ? (
            <p className="people-note">This wallet holds no tokenized stocks right now.</p>
          ) : (
            <div className="investor-holdings">
              {holdings.map((h) => (
                <div key={h.ticker} data-sym={h.ticker}>
                  <HoldingRow holding={h} actions={[{ label: "Copy", href: `/buy/${h.ticker}?ref=${encodeURIComponent(investor.id)}` }]} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="investor-section" aria-labelledby="investor-fills">
          <div className="investor-section-head">
            <p className="eyebrow" id="investor-fills">
              Fills on Solera
            </p>
          </div>
          <InvestorFills key={investor.id} owner={investor.id} onChain={isWallet} />
        </section>
      </Panel>
    </div>
  );
}
