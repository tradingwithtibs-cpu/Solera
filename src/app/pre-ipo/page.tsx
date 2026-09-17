"use client";

import { useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { SegmentedControl } from "@/components/SegmentedControl";
import { CompanyComparisonCard, PreIpoRow } from "@/components/PreIpo";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { compareAcrossIssuers, type Issuer } from "@/lib/pre-ipo";

export default function PreIpoPage() {
  const { tokens, sources, isLoaded, error } = usePreIpo();
  const [issuer, setIssuer] = useState<"all" | Issuer>("all");

  const comparisons = compareAcrossIssuers(tokens);
  const visible = tokens
    .filter((t) => issuer === "all" || t.issuer === issuer)
    .sort((a, b) => b.impliedValuation - a.impliedValuation);

  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <p className="eyebrow">Private companies, public prices</p>
        <h1>
          Pre-IPO<span className="text-violet-500">.</span>
        </h1>
        <p>Tokenized exposure to companies that haven&apos;t listed yet, from two issuers, priced live on Solana.</p>
      </header>

      {!isLoaded ? (
        <LoadingState />
      ) : error ? (
        <p className="px-5 text-sm text-rose-600">{error}</p>
      ) : (
        <div className="space-y-6 px-5 pb-6 sm:px-7">
          {comparisons.length > 0 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Same company, two issuers</h2>
                <p className="text-xs text-neutral-500">
                  The same private company can be bought as two different tokens. Which one is cheaper changes
                  as they trade.
                </p>
              </div>
              {comparisons.map((c) => (
                <CompanyComparisonCard key={c.company.id} comparison={c} />
              ))}
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-900">All pre-IPO tokens</h2>
              <p className="text-xs text-neutral-400">
                {tokens.length} tokens
                {sources && !sources.tessera && " · Tessera feed offline"}
                {sources && !sources.prestocks && " · PreStocks feed offline"}
              </p>
            </div>
            <SegmentedControl
              label="Issuer"
              value={issuer}
              onChange={setIssuer}
              options={[
                { value: "all", label: "All" },
                { value: "PreStocks", label: "PreStocks" },
                { value: "Tessera", label: "Tessera" },
              ]}
            />
            <div className="market-list">
              {visible.map((t) => (
                <PreIpoRow key={t.mint} token={t} />
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-400">
              Token prices from Jupiter. Mark prices and valuations are published by each issuer from private
              secondary-market deals. Pre-IPO tokens are not shares: PreStocks tokens track SPV exposure, Tessera
              T-Tokens are loan participation rights. Not financial advice.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
