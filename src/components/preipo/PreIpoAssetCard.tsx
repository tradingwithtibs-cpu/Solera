"use client";

import Link from "next/link";
import { COMPANIES, formatCompactUsd, formatValuation, listedSentence, type CompanyComparison, type PreIpoToken } from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { shortAddress } from "@/lib/investors";
import { NewsList } from "@/components/NewsList";
import { CompanyBadge, CompanyComparisonCard } from "@/components/PreIpo";
import { PreIpoBuyForm } from "./PreIpoBuyForm";
import { gapTone, issuerStructure, signedPct } from "./format";

/**
 * The selected pre-IPO token: head, the honest no-chart box, the three
 * facts (issuer mark, gap to mark, liquidity), the two-issuer comparison
 * when the company has one, agent prompts, company news, and the ticket
 * beside it. Everything comes from /api/pre-ipo and Jupiter; nothing here
 * is synthesised.
 */
export function PreIpoAssetCard({
  token,
  comparison,
  onSelect,
  held,
}: {
  token: PreIpoToken;
  comparison?: CompanyComparison;
  onSelect: (token: PreIpoToken) => void;
  /** Tokens of this mint in the connected wallet, live mode only. */
  held?: number;
}) {
  const company = COMPANIES[token.company];
  const change = token.change24hPct;
  const gap = token.premiumPct;
  const q = (s: string) => `/agent?q=${encodeURIComponent(s)}`;

  return (
    <div>
      <div className="pi-asset-head">
        <CompanyBadge company={token.company} size="lg" />
        <div className="min-w-0">
          <h3>
            {company.name} <small>{token.symbol}</small>
          </h3>
          <p>
            {token.issuer} ·{" "}
            <a href={`https://solscan.io/token/${token.mint}`} target="_blank" rel="noreferrer" className="font-mono" title={token.mint}>
              {shortAddress(token.mint)} ↗
            </a>{" "}
            · {issuerStructure(token.issuer)}
          </p>
        </div>
        <div className="pi-asset-price">
          <b>{token.tokenPrice > 0 ? formatCurrency(token.tokenPrice) : "—"}</b>
          <small className={change === undefined ? "muted" : change >= 0 ? "up" : "down"}>
            {change === undefined ? "— 24h" : `${signedPct(change)} 24h`}
          </small>
        </div>
      </div>

      {company.listed && (
        <div className="pi-callout warn pi-listed" role="note">
          <span className="eyebrow">Listed company</span>
          {listedSentence(company)}{" "}
          {company.listed.xstock ? (
            <Link href={`/asset/${company.listed.xstock}`}>
              The listed share trades on Solana as {company.listed.xstock} →
            </Link>
          ) : null}
        </div>
      )}

      <div className="pi-asset-grid">
        <div className="min-w-0">
          <div className="pi-chart-bar">
            <span>
              {token.symbol} · Jupiter · {token.holders !== undefined ? `${token.holders.toLocaleString()} holders` : "on-chain price"}
            </span>
          </div>
          <div className="pi-chart-empty">No price history source for {token.issuer} tokens yet.</div>

          <dl className="pi-facts">
            <div>
              <dt>Issuer mark</dt>
              <dd>
                {token.markPrice > 0 ? formatCurrency(token.markPrice) : "—"}
                <small>{token.issuer} fair value per token</small>
              </dd>
            </div>
            <div>
              <dt>Gap to mark</dt>
              <dd className={gapTone(gap)}>
                {signedPct(gap)}
                <small>
                  implies {formatValuation(token.impliedValuation)} vs {formatValuation(token.markValuation)} at the mark
                </small>
              </dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd>
                {token.liquidityUsd !== undefined ? formatCompactUsd(token.liquidityUsd) : "—"}
                <small>Solana pools · no vote, {issuerStructure(token.issuer).replace(", not shares", "")}</small>
              </dd>
            </div>
          </dl>

          {comparison && (
            <section className="pi-section">
              <p className="eyebrow">Same company, two issuers</p>
              <CompanyComparisonCard comparison={comparison} compact selectedMint={token.mint} onSelect={onSelect} />
            </section>
          )}

          <section className="pi-section">
            <p className="eyebrow">Ask the agent</p>
            <div className="pi-ask">
              <Link href={q(`Why did ${token.symbol} move today?`)}>Why did {token.symbol} move today?</Link>
              <Link href={q(`Is ${token.symbol}'s gap normal?`)}>Is {token.symbol}&apos;s gap normal?</Link>
              <Link href={q(`Who holds ${token.symbol}?`)}>Who holds {token.symbol}?</Link>
            </div>
          </section>

          <section className="pi-section">
            <p className="eyebrow">{company.name} in the news</p>
            <NewsList scope={{ kind: "company", company: company.id }} limit={3} />
          </section>
        </div>

        <div className="pi-ticket">
          <PreIpoBuyForm token={token} held={held} />
        </div>
      </div>
    </div>
  );
}
