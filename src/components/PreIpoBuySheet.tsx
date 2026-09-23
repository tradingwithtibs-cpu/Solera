"use client";

import { useEffect, useId, useRef } from "react";
import { COMPANIES, formatValuation, type PreIpoToken } from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { PreIpoBuyForm } from "./preipo/PreIpoBuyForm";

/**
 * Buy a pre-IPO token for real, right here, in a sheet so the row or
 * comparison the user was reading stays behind it. The form is the same
 * one the asset card embeds on desktop; this is its phone and
 * market-row placement. Escape and the scrim close it; focus goes to the
 * sheet on open and back to the opener on close.
 */
export function PreIpoBuySheet({ token, onClose }: { token: PreIpoToken; onClose: () => void }) {
  const company = COMPANIES[token.company];
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const { preIpoHoldings } = useActivePortfolio();

  // Callers pass inline arrows and the parents re-render on every poll, so the effect must not re-run on `onClose`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="sheet scrim" role="presentation" onClick={onClose}>
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-box glass glass-era max-h-[92vh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <div className="min-w-0">
            <p className="eyebrow">{token.issuer}</p>
            <h3 id={titleId}>
              Buy {company.name} <span className="muted">· {token.symbol}</span>
            </h3>
            <p className="sheet-text">
              <span className="font-mono">{formatCurrency(token.tokenPrice)}</span> per token · implies {formatValuation(token.impliedValuation)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-icon" aria-label="Close">
            ✕
          </button>
        </header>
        <PreIpoBuyForm token={token} onDone={onClose} held={preIpoHoldings[token.mint]} />
      </div>
    </div>
  );
}
