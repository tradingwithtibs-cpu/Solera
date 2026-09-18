"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { hasInjectedWallet, isAndroid, isMobileBrowser, phantomBrowseUrl, solflareBrowseUrl } from "@/lib/mobile-wallet";

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
 * - iPhone (or any phone browser with no wallet): a sheet that hands this
 *   page to Phantom's or Solflare's built-in browser, where connecting
 *   works. Without this, tapping Phantom in the picker just links to the
 *   App Store.
 */
export function ConnectWalletProvider({ children }: { children: React.ReactNode }) {
  const { setVisible } = useWalletModal();
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);

  const openConnect = useCallback(() => {
    if (isMobileBrowser() && !hasInjectedWallet() && !isAndroid()) {
      setShowMobilePrompt(true);
      return;
    }
    setVisible(true);
  }, [setVisible]);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <ConnectWalletContext.Provider value={{ openConnect }}>
      {children}
      {showMobilePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-3 sm:items-center"
          onClick={() => setShowMobilePrompt(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open in your wallet app"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-neutral-900">Open Solera in your wallet</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              On a phone, wallets connect from inside their own app. Tap one below and Solera opens in that
              wallet&apos;s browser, ready to connect and trade.
            </p>
            <div className="mt-4 space-y-2">
              <a href={phantomBrowseUrl(pageUrl)} className="btn-primary block w-full text-center">
                Open in Phantom
              </a>
              <a href={solflareBrowseUrl(pageUrl)} className="btn-secondary block w-full text-center">
                Open in Solflare
              </a>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
              No wallet yet? Install Phantom or Solflare from the App Store, then come back here. You can keep
              exploring in practice mode without one.
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
