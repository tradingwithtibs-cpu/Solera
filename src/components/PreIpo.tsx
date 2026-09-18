"use client";

import {
  COMPANIES,
  formatCompactUsd,
  formatValuation,
  type CompanyComparison,
  type PreIpoToken,
} from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { useState } from "react";
import { PreIpoBuySheet } from "./PreIpoBuySheet";
import { NewsList } from "./NewsList";

/** A Buy button that opens the in-app buy sheet for `token`. */
function BuyButton({ token, primary = false }: { token: PreIpoToken; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          primary
            ? "btn-primary mt-3 block w-full rounded-full py-2 text-center text-xs font-semibold"
            : "rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-600 active:bg-violet-100"
        }
      >
        Buy {primary ? token.issuer : ""}
      </button>
      {open && <PreIpoBuySheet token={token} onClose={() => setOpen(false)} />}
    </>
  );
}

function CompanyBadge({ company, size = "sm" }: { company: PreIpoToken["company"]; size?: "sm" | "lg" }) {
  const c = COMPANIES[company];
  const sizing = size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-[11px]";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizing} ${c.color}`}>
      {c.short}
    </span>
  );
}

/** "+8.9% vs mark" in amber (paying up) or "−2.3% vs mark" in green (a discount). */
export function MarkPremiumBadge({ premiumPct, compact = false }: { premiumPct: number; compact?: boolean }) {
  if (!Number.isFinite(premiumPct)) return null;
  const sign = premiumPct > 0 ? "+" : premiumPct < 0 ? "−" : "";
  const tone =
    Math.abs(premiumPct) < 0.5 ? "text-neutral-500" : premiumPct > 0 ? "text-amber-600" : "text-emerald-600";
  return (
    <span
      className={`text-[10px] font-medium tabular-nums ${tone}`}
      title={`Token trades ${Math.abs(premiumPct).toFixed(1)}% ${premiumPct >= 0 ? "above" : "below"} the issuer's mark price`}
    >
      {sign}
      {Math.abs(premiumPct).toFixed(1)}%{compact ? "" : " vs mark"}
    </span>
  );
}

function IssuerPill({ issuer }: { issuer: PreIpoToken["issuer"] }) {
  const tone = issuer === "Tessera" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{issuer}</span>;
}

/** One row in the pre-IPO market list. */
export function PreIpoRow({ token }: { token: PreIpoToken }) {
  const company = COMPANIES[token.company];
  return (
    <article className="market-item">
      <div className="market-main">
        <CompanyBadge company={token.company} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {company.name} <IssuerPill issuer={token.issuer} />
          </h2>
          <p className="truncate text-xs text-neutral-500">
            {token.symbol} · implies {formatValuation(token.impliedValuation)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="mb-1 font-mono text-sm font-semibold">{formatCurrency(token.tokenPrice)}</p>
          <p className="mb-1">
            <MarkPremiumBadge premiumPct={token.premiumPct} />
          </p>
        </div>
      </div>
      <div className="market-meta">
        <span>
          Mark <span className="font-mono">{formatCurrency(token.markPrice)}</span>
          {token.holders !== undefined && (
            <>
              {" · "}
              <span className="font-mono">{token.holders.toLocaleString()}</span> holders
            </>
          )}
          {token.liquidityUsd !== undefined && (
            <>
              {" · "}
              <span className="font-mono">{formatCompactUsd(token.liquidityUsd)}</span> liquidity
            </>
          )}
        </span>
        <BuyButton token={token} />
      </div>
    </article>
  );
}

/**
 * The same company from two issuers, side by side, ordered cheapest first
 * by the valuation each token's price implies. The headline is the one
 * sentence a buyer needs: which token is the cheaper way in, and by how
 * much.
 */
export function CompanyComparisonCard({ comparison }: { comparison: CompanyComparison }) {
  const { company, tokens, cheapest, priciest, cheaperByPct, markDisagreementPct, bestDiscountToMark } = comparison;
  const marksDisagree = markDisagreementPct >= 30;
  return (
    <section className="card-elevated rounded-3xl border border-neutral-100 p-5">
      <div className="flex items-center gap-3">
        <CompanyBadge company={company.id} size="lg" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{company.name}</h2>
          <p className="text-xs text-neutral-500">{company.sector} · sold by {tokens.length} issuers</p>
        </div>
      </div>

      {/* Two honest answers to "which is cheaper?", labelled so they can't be confused. */}
      <div className="mt-4 space-y-2">
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-snug text-emerald-900">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Lower company valuation</span>
          <span className="font-semibold">{cheapest.issuer}</span> · {formatValuation(cheapest.impliedValuation)} implied,{" "}
          <span className="font-mono font-semibold">{cheaperByPct.toFixed(0)}%</span> below {priciest.issuer}&apos;s{" "}
          {formatValuation(priciest.impliedValuation)}
        </p>
        <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-snug text-neutral-700">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Vs each issuer&apos;s own mark</span>
          {tokens.map((t, i) => (
            <span key={t.mint}>
              {i > 0 && " · "}
              {t.issuer}{" "}
              <span className={`font-mono font-semibold ${t.premiumPct < 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {Math.abs(t.premiumPct).toFixed(0)}% {t.premiumPct < 0 ? "below" : "above"}
              </span>
            </span>
          ))}
          {bestDiscountToMark !== cheapest && (
            <span className="block text-xs text-neutral-500">
              {bestDiscountToMark.issuer} is the bigger discount to its own mark; {cheapest.issuer} is the lower valuation.
            </span>
          )}
        </p>
        {marksDisagree && (
          <details className="rounded-2xl bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-900">
            <summary className="cursor-pointer font-semibold">
              Issuers disagree on {company.name}&apos;s value ({tokens.map((t) => formatValuation(t.markValuation)).join(" vs ")})
            </summary>
            <p className="mt-1">
              At least one mark is stale. Implied valuation compares what you actually pay for the company; discount-to-mark
              only says how each token trades against its own issuer&apos;s number.
            </p>
          </details>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tokens.map((t) => (
          <div
            key={t.mint}
            className={`rounded-2xl border p-3 ${t === cheapest ? "border-emerald-200 bg-emerald-50/40" : "border-neutral-100"}`}
          >
            <div className="flex items-center justify-between">
              <IssuerPill issuer={t.issuer} />
              {t === cheapest && <span className="text-[10px] font-semibold text-emerald-700">Lowest valuation</span>}
            </div>
            <p className="mt-2 font-mono text-lg font-semibold tabular-nums">{formatCurrency(t.tokenPrice)}</p>
            <p className="text-[11px] text-neutral-500">{t.symbol} token price</p>
            <dl className="mt-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">Implied valuation</dt>
                <dd className="font-mono font-medium">{formatValuation(t.impliedValuation)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">Vs issuer mark</dt>
                <dd>
                  <MarkPremiumBadge premiumPct={t.premiumPct} compact />
                </dd>
              </div>
              {t.holders !== undefined && (
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Holders</dt>
                  <dd className="font-mono font-medium">{t.holders.toLocaleString()}</dd>
                </div>
              )}
              {t.liquidityUsd !== undefined && (
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Liquidity</dt>
                  <dd className="font-mono font-medium">{formatCompactUsd(t.liquidityUsd)}</dd>
                </div>
              )}
            </dl>
            {t === cheapest ? (
              <BuyButton token={t} primary />
            ) : (
              <div className="mt-3">
                <BuyButton token={t} />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
        Token prices can&apos;t be compared directly — one token from each issuer represents a different slice of the
        company. Implied valuation = live token price ÷ issuer mark × the valuation that mark stands for.
      </p>
      <details className="mt-3 rounded-2xl bg-neutral-50 px-4 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Latest on {company.name}</summary>
        <div className="pb-1">
          <NewsList scope={{ kind: "company", company: company.id }} limit={3} />
        </div>
      </details>
    </section>
  );
}
