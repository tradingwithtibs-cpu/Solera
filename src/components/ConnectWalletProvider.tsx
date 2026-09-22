"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { hasInjectedWallet, isAndroid, isMobileBrowser, phantomBrowseUrl, solflareBrowseUrl } from "@/lib/mobile-wallet";
import { PhantomDeepLinkWalletName } from "@/lib/phantom-deeplink-adapter";

const ConnectWalletContext = createContext<{ openConnect: () => void }>({ openConnect: () => {} });

/** The one way to start a wallet connection anywhere in the app. */
export function useConnectWallet() {
  return useContext(ConnectWalletContext);
}

/**
 * Routes "connect wallet" to the right place for the device:
 * - Desktop, or a phone inside a wallet's in-app browser: the standard
 *   wallet picker.
 * - Android with no injected wallet: the picker too — Mobile Wallet Adapter
 *   is registered there and opens the wallet app itself.
 * - iPhone in Safari: a sheet whose first choice is Phantom's deeplink
 *   protocol. Phantom opens just to approve and sends the user straight
 *   back to this page in Safari — no switching to Phantom's own browser.
 *   Opening in a wallet's in-app browser stays available as a fallback
 *   (it's the only route for Solflare).
 */
export function ConnectWalletProvider({ children }: { children: React.ReactNode }) {
  const { setVisible } = useWalletModal();
  const { select, connect, wallet } = useWallet();
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);

  const openConnect = useCallback(() => {
    if (isMobileBrowser() && !hasInjectedWallet() && !isAndroid()) {
      setShowMobilePrompt(true);
      return;
    }
    setVisible(true);
  }, [setVisible]);

  const connectPhantom = useCallback(() => {
    // Selecting the adapter makes the provider call connect(); if it's
    // already selected (an earlier attempt), call connect() ourselves.
    if (wallet?.adapter.name === PhantomDeepLinkWalletName) {
      connect().catch(() => {});
    } else {
      select(PhantomDeepLinkWalletName);
    }
  }, [select, connect, wallet]);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <ConnectWalletContext.Provider value={{ openConnect }}>
      {children}
      {showMobilePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center scrim p-3 sm:items-center"
          onClick={() => setShowMobilePrompt(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect your wallet"
            className="w-full max-w-md rounded-3xl bg-panel p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-neutral-900">Connect your wallet</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Phantom opens to approve, then brings you right back here. You stay in Safari.
            </p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={connectPhantom} className="btn-primary block w-full text-center">
                Connect Phantom
              </button>
              <a href={solflareBrowseUrl(pageUrl)} className="btn-secondary block w-full text-center">
                Open in Solflare
              </a>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
              Prefer Phantom&apos;s built-in browser?{" "}
              <a href={phantomBrowseUrl(pageUrl)} className="font-semibold text-violet-600">
                Open Solera there
              </a>
              . No wallet yet? Install Phantom or Solflare from the App Store; you can keep exploring in practice mode
              meanwhile.
            </p>
            <button
              type="button"
              onClick={() => setShowMobilePrompt(false)}
              className="mt-3 w-full rounded-full py-2 text-sm font-semibold text-neutral-500"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </ConnectWalletContext.Provider>
  );
}
