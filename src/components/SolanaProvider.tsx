"use client";

import { useCallback, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import type { WalletError } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectWalletProvider } from "./ConnectWalletProvider";
import { DeepLinkResumer } from "./DeepLinkResumer";
import { PhantomDeepLinkWalletAdapter } from "@/lib/phantom-deeplink-adapter";

// Default styles for the wallet selection modal — overridden in globals.css
// to match the app's own palette rather than the library's default purple.
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Real Solana connectivity, wrapping the whole app. A connected wallet is
 * what makes trading live: swaps are signed here (see lib/trade.ts) and the
 * portfolio reads this wallet's real balances (see use-live-portfolio.ts).
 * With no wallet connected the app runs in practice mode.
 *
 * mainnet-beta throughout: live trades settle on mainnet, and a real
 * wallet's real balance is what a user (or judge) expects to see.
 */
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl("mainnet-beta"), []);
  // Explicit adapters for the two dominant wallets; most modern wallets also
  // auto-register via the Wallet Standard and show up without needing an
  // adapter listed here at all.
  // Plus Phantom over deeplinks for iPhone Safari, where no wallet can
  // inject itself: it reports Unsupported everywhere else.
  const wallets = useMemo(() => {
    const phantom = new PhantomWalletAdapter();
    return [phantom, new SolflareWalletAdapter(), new PhantomDeepLinkWalletAdapter({ icon: phantom.icon })];
  }, []);

  // Without this the adapter console.error()s every wallet error, and a user
  // simply closing the Phantom popup ("User rejected the request") surfaces
  // as a red overlay in dev. Declining to connect is a choice, not a fault:
  // the app just stays in practice mode. Anything else is still worth a log.
  const onError = useCallback((error: WalletError) => {
    if (/user rejected|rejected the request/i.test(error.message)) return;
    console.warn(`Wallet: ${error.name}: ${error.message}`);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>
          <ConnectWalletProvider>
            <DeepLinkResumer />
            {children}
          </ConnectWalletProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
