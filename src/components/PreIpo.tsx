"use client";

import { useState } from "react";
import { COMPANIES, formatCompactUsd, formatValuation, listedSentence, type CompanyComparison, type PreIpoToken } from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { fillFor } from "@/lib/palette";
import { PreIpoBuySheet } from "./PreIpoBuySheet";
import { NewsList } from "./NewsList";
import { gapTone, signedPct } from "./preipo/format";

/** A Buy button that opens the in-app buy sheet for `token`. */
export function BuyButton({ token, primary = false, label }: { token: PreIpoToken; primary?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary ? "btn-live btn-small" : "btn-secondary btn-small"}>
        {label ?? (primary ? `Buy ${token.issuer}` : "Buy")}
      </button>
      {open && <PreIpoBuySheet token={token} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Initials tile for a company, on one of the ink-safe fills. */
export function CompanyBadge({ company, size = "sm" }: { company: PreIpoToken["company"]; size?: "sm" | "md" | "lg" }) {
  const c = COMPANIES[company];
  return (
    <span className={`pi-badge ${size}`} style={{ background: fillFor(c.color, c.id) }} aria-hidden="true">
      {c.short}
    </span>
  );
}

/** "+8.9% vs mark" in amber (paying up) or "−2.3% vs mark" in green (a discount). */
export function MarkPremiumBadge({ premiumPct, compact = false }: { premiumPct: number; compact?: boolean }) {
  if (!Number.isFinite(premiumPct)) return null;
  const tone = gapTone(premiumPct);
  return (
    <span
      className={`font-mono text-[10px] font-medium tabular-nums ${tone === "warn" ? "text-warn" : tone === "up" ? "text-gain" : "text-muted"}`}
      title={`Token trades ${Math.abs(premiumPct).toFixed(1)}% ${premiumPct >= 0 ? "above" : "below"} the issuer's mark price`}
    >
      {signedPct(premiumPct)}
      {compact ? "" : " vs mark"}
    </span>
  );
}

/** The boxed "+29.6% vs mark" cell on a market row. */
export function GapChip({ premiumPct }: { premiumPct: number }) {
  return (
    <span className={`gap pi-gap ${gapTone(premiumPct)}`} title="Token price vs the issuer's mark">
      {signedPct(premiumPct)} <span className="gap-word">vs mark</span>
    </span>
  );
}

export function IssuerPill({ issuer }: { issuer: PreIpoToken["issuer"] }) {
  return <span className={`pi-issuer ${issuer === "Tessera" ? "tessera" : "prestocks"}`}>{issuer}</span>;
}

/** "LISTED" beside a token whose company has gone public since the token was issued. */
export function ListedPill({ company }: { company: PreIpoToken["company"] }) {
  const listed = COMPANIES[company].listed;
  if (!listed) return null;
  return (
    <span className="pi-issuer listed" title={listedSentence(COMPANIES[company]) ?? undefined}>
      Listed · {listed.ticker}
    </span>
  );
}

/**
 * One row in the pre-IPO market list: badge, symbol + issuer, the company
 * and its mark, the live price with the 24h move, the gap chip and the
 * watchlist star. Clicking the row selects it; the star is its own button.
 */
export function PreIpoRow({
  token,
  selected = false,
  onSelect,
  star,
}: {
  token: PreIpoToken;
  selected?: boolean;
  onSelect?: (token: PreIpoToken) => void;
  /** The watchlist control, rendered as the trailing cell. */
  star?: React.ReactNode;
}) {
  const company = COMPANIES[token.company];
  const change = token.change24hPct;
  return (
    <div className={`row pi-row ${selected ? "on" : ""}`} data-sym={token.symbol}>
      <button type="button" className="pi-row-select" aria-pressed={selected} onClick={() => onSelect?.(token)}>
        <CompanyBadge company={token.company} />
        <span className="row-main">
          <b>
            {token.symbol} <IssuerPill issuer={token.issuer} /> <ListedPill company={token.company} />
          </b>
          <small>
            {company.name}
            {company.listed ? ` (${company.listed.exchange}: ${company.listed.ticker})` : ""} · {token.issuer} · mark{" "}
            {formatCurrency(token.markPrice)}
          </small>
        </span>
        <span className="row-num">
          <b>{token.tokenPrice > 0 ? formatCurrency(token.tokenPrice) : "—"}</b>
          <small className={change === undefined ? "" : change >= 0 ? "up" : "down"}>
            {change === undefined ? "—" : signedPct(change)} 24h
          </small>
        </span>
        <GapChip premiumPct={token.premiumPct} />
      </button>
      {star ? <span className="flex shrink-0 items-center self-stretch px-2">{star}</span> : <span aria-hidden="true" />}
    </div>
  );
}

/** The two issuers' tokens for one company, side by side: the compact block inside the asset card. */
function CompactComparison({
  comparison,
  selectedMint,
  onSelect,
}: {
  comparison: CompanyComparison;
  selectedMint?: string;
  onSelect?: (token: PreIpoToken) => void;
}) {
  const { tokens, cheapest, priciest, cheaperByPct } = comparison;
  return (
    <div>
      <div className="pi-compare-rows">
        {tokens.map((t) => (
          <button
            key={t.mint}
            type="button"
            className={t.mint === selectedMint ? "on" : ""}
            aria-pressed={t.mint === selectedMint}
            onClick={() => onSelect?.(t)}
            title={`Show ${t.symbol}`}
          >
            <span>
              <IssuerPill issuer={t.issuer} /> {t.symbol}
            </span>
            <b>{t.tokenPrice > 0 ? formatCurrency(t.tokenPrice) : "—"}</b>
            <small className={gapTone(t.premiumPct)}>{signedPct(t.premiumPct)} vs mark</small>
            <small>implies {formatValuation(t.impliedValuation)}</small>
          </button>
        ))}
      </div>
      <p className="pi-note">
        <b>{cheapest.issuer}</b> is the lower valuation, {cheaperByPct.toFixed(0)}% below {priciest.issuer}&apos;s{" "}
        {formatValuation(priciest.impliedValuation)}. Token prices can&apos;t be compared directly: one token from each issuer is a
        different slice of the company, and neither is a share.
      </p>
    </div>
  );
}

/**
 * The same company from two issuers, side by side, ordered cheapest first
 * by the valuation each token's price implies. The headline is the one
 * sentence a buyer needs: which token is the cheaper way in, and by how
 * much. `compact` is the short form inside the asset card.
 */
export function CompanyComparisonCard({
  comparison,
  compact = false,
  selectedMint,
  onSelect,
}: {
  comparison: CompanyComparison;
  compact?: boolean;
  selectedMint?: string;
  onSelect?: (token: PreIpoToken) => void;
}) {
  const { company, tokens, cheapest, priciest, cheaperByPct, markDisagreementPct, bestDiscountToMark } = comparison;
  if (compact) return <CompactComparison comparison={comparison} selectedMint={selectedMint} onSelect={onSelect} />;
  const marksDisagree = markDisagreementPct >= 30;
  return (
    <article className="pi-company" data-company={company.id}>
      <div className="pi-company-head">
        <CompanyBadge company={company.id} size="md" />
        <div className="min-w-0">
          <h4>{company.name}</h4>
          <p>
            {company.sector}
            {company.listed ? ` · listed on ${company.listed.exchange} as ${company.listed.ticker}` : ""} · sold by {tokens.length} issuers
          </p>
        </div>
      </div>

      {/* Two honest answers to "which is cheaper?", labelled so they can't be confused. */}
      <div className="pi-callout gain">
        <span className="eyebrow">Lower company valuation</span>
        <b>{cheapest.issuer}</b> · {formatValuation(cheapest.impliedValuation)} implied,{" "}
        <span className="font-mono font-semibold">{cheaperByPct.toFixed(0)}%</span> below {priciest.issuer}&apos;s{" "}
        {formatValuation(priciest.impliedValuation)}
      </div>
      <div className="pi-callout">
        <span className="eyebrow">Vs each issuer&apos;s own mark</span>
        {tokens.map((t, i) => (
          <span key={t.mint}>
            {i > 0 && " · "}
            {t.issuer}{" "}
            <span className={`font-mono font-semibold ${t.premiumPct < 0 ? "text-gain" : "text-warn"}`}>
              {Math.abs(t.premiumPct).toFixed(0)}% {t.premiumPct < 0 ? "below" : "above"}
            </span>
          </span>
        ))}
        {bestDiscountToMark !== cheapest && (
          <small>
            {bestDiscountToMark.issuer} is the bigger discount to its own mark; {cheapest.issuer} is the lower valuation.
          </small>
        )}
      </div>
      {marksDisagree && (
        <details className="pi-callout warn">
          <summary>
            Issuers disagree on {company.name}&apos;s value ({tokens.map((t) => formatValuation(t.markValuation)).join(" vs ")})
          </summary>
          <small>
            At least one mark is stale. Implied valuation compares what you actually pay for the company; discount-to-mark only says
            how each token trades against its own issuer&apos;s number.
          </small>
        </details>
      )}

      <div className="pi-tiles">
        {tokens.map((t) => (
          <div key={t.mint} className={`pi-tile ${t === cheapest ? "best" : ""}`}>
            <div className="pi-tile-top">
              <IssuerPill issuer={t.issuer} />
              {t === cheapest && <span className="chip gap">Lowest valuation</span>}
            </div>
            <div className="pi-tile-price">
              <b>{t.tokenPrice > 0 ? formatCurrency(t.tokenPrice) : "—"}</b>
              <small>{t.symbol} token price</small>
            </div>
            <dl>
              <dt>Implied valuation</dt>
              <dd>{formatValuation(t.impliedValuation)}</dd>
              <dt>Vs issuer mark</dt>
              <dd>
                <MarkPremiumBadge premiumPct={t.premiumPct} compact />
              </dd>
              {t.holders !== undefined && (
                <>
                  <dt>Holders</dt>
                  <dd>{t.holders.toLocaleString()}</dd>
                </>
              )}
              {t.liquidityUsd !== undefined && (
                <>
                  <dt>Liquidity</dt>
                  <dd>{formatCompactUsd(t.liquidityUsd)}</dd>
                </>
              )}
            </dl>
            <BuyButton token={t} primary={t === cheapest} />
          </div>
        ))}
      </div>
      <p className="pi-note">
        Token prices can&apos;t be compared directly — one token from each issuer represents a different slice of the company.
        Implied valuation = live token price ÷ issuer mark × the valuation that mark stands for.
      </p>
      <details className="pi-latest">
        <summary>Latest on {company.name}</summary>
        <NewsList scope={{ kind: "company", company: company.id }} limit={3} />
      </details>
    </article>
  );
}
