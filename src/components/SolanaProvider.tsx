"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

// Default styles for the wallet selection modal — overridden in globals.css
// to match Stocklana's own palette rather than the library's default purple.
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Real Solana connectivity, wrapping the whole app. This is the first genuinely
 * on-chain thing in Stocklana: a real read-only wallet connection and a real
 * balance read (see OnChainBadge.tsx) — everything else in the app (holdings,
 * prices, trades) is still simulated, and stays that way. Connecting a wallet
 * here never touches the mock portfolio; it's a separate, honest layer.
 *
 * mainnet-beta because reading a balance is a free, harmless, read-only RPC
 * call — no transaction, no risk — and a real wallet's real balance is more
 * convincing than a devnet one. The devnet memo-transaction step (later) is
 * a different, additive concern and will use its own connection.
 */
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl("mainnet-beta"), []);
  // Explicit adapters for the two dominant wallets; most modern wallets also
  // auto-register via the Wallet Standard and show up without needing an
  // adapter listed here at all.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
