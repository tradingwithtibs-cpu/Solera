import type { PreIpoToken } from "@/lib/pre-ipo";

/** "+29.6%" / "−2.3%" with a true minus sign; "—" when there is no figure. */
export function signedPct(pct: number | undefined, digits = 1): string {
  if (pct === undefined || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/**
 * The colour a gap-to-mark figure takes: amber when the token trades above
 * the issuer's mark (paying up), gain green when below (a discount), and
 * neutral inside half a percent. Never green for "up" — a premium is a
 * cost, not a gain.
 */
export function gapTone(premiumPct: number): "warn" | "up" | "" {
  if (!Number.isFinite(premiumPct) || Math.abs(premiumPct) < 0.5) return "";
  return premiumPct > 0 ? "warn" : "up";
}

/** What a token of each issuer actually is, in plain words. */
export function issuerStructure(issuer: PreIpoToken["issuer"]): string {
  return issuer === "Tessera" ? "loan participation rights, not shares" : "SPV exposure, not shares";
}
