"use client";

import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { hasInjectedWallet, isAndroid, isMobileBrowser, phantomBrowseUrl, solflareBrowseUrl } from "@/lib/mobile-wallet";
import { PhantomDeepLinkWalletName } from "@/lib/phantom-deeplink-adapter";
import { Sheet, SheetHead } from "./auth/Sheet";

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
  const id = useId();
  const { setVisible } = useWalletModal();
  const { select, connect, wallet, connecting } = useWallet();
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  // A connect that runs long is a wallet waiting for the person, not a fault here: on a Mac in full screen the
  // extension's approval window often opens behind Chrome. After a few seconds, say where to look and offer a reset.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!connecting) return;
    const id = setTimeout(() => setStuck(true), 6_000);
    return () => {
      clearTimeout(id);
      queueMicrotask(() => setStuck(false));
    };
  }, [connecting]);
  const startOver = () => {
    try {
      window.localStorage.removeItem("walletName");
    } catch {
      // Storage unavailable: the reload alone still clears the pending attempt.
    }
    window.location.reload();
  };

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
  const close = () => setShowMobilePrompt(false);

  return (
    <ConnectWalletContext.Provider value={{ openConnect }}>
      {children}
      {connecting && stuck && (
        <div className="connect-hint" role="status">
          <p>
            <b>{wallet?.adapter.name ?? "Your wallet"} is waiting for you.</b> Click its icon in the browser toolbar to see the request. In full screen its
            window can open behind the browser.
          </p>
          <div className="connect-hint-actions">
            <button type="button" className="btn-secondary btn-small" onClick={startOver}>
              Start over
            </button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setStuck(false)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {showMobilePrompt && (
        <Sheet labelledBy={id} onClose={close}>
          <SheetHead eyebrow="Wallet" title="Connect your wallet" id={id} onClose={close} />
          <p className="sheet-text">Phantom opens to approve, then brings you right back here. You stay in Safari.</p>
          <div className="sheet-actions">
            <button type="button" onClick={connectPhantom} className="btn-primary flex-1">
              Connect Phantom
            </button>
            <a href={solflareBrowseUrl(pageUrl)} className="btn-secondary flex-1">
              Open in Solflare
            </a>
          </div>
          <p className="sheet-foot leading-relaxed">
            Prefer Phantom&apos;s built-in browser?{" "}
            <a href={phantomBrowseUrl(pageUrl)} className="font-semibold text-accent-text underline underline-offset-2">
              Open Solera there
            </a>
            . No wallet yet? Install Phantom or Solflare from the App Store; you can keep exploring in practice mode meanwhile.
          </p>
          <button type="button" onClick={close} className="btn-ghost mt-3 w-full">
            Not now
          </button>
        </Sheet>
      )}
    </ConnectWalletContext.Provider>
  );
}
