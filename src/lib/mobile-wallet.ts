/**
 * Phones have no browser extensions, so on mobile the only way to connect
 * is inside the wallet app's own browser (or, on Android, Solana's Mobile
 * Wallet Adapter, which the wallet library registers automatically). These
 * helpers decide whether to show the "open in your wallet" prompt and build
 * the universal links that hand the current page to Phantom or Solflare.
 */

export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

/** True when a wallet has injected itself (extension, or the wallet app's in-app browser). */
export function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { phantom?: { solana?: unknown }; solflare?: unknown; solana?: unknown; backpack?: unknown };
  return !!(w.phantom?.solana || w.solflare || w.solana || w.backpack);
}

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/** Phantom's in-app browser, opened on the current page. */
export function phantomBrowseUrl(pageUrl: string): string {
  const origin = new URL(pageUrl).origin;
  return `https://phantom.app/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(origin)}`;
}

/** Solflare's in-app browser, opened on the current page. */
export function solflareBrowseUrl(pageUrl: string): string {
  const origin = new URL(pageUrl).origin;
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(origin)}`;
}
