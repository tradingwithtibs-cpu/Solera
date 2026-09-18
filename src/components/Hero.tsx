"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnectWallet } from "./ConnectWalletProvider";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/format";
import { shortAddress } from "@/lib/investors";
import { useProfile } from "@/hooks/use-profiles";
import { ProfileButton } from "./ProfileButton";

/**
 * The first thing a visitor sees. Two states:
 * - No wallet: what Solera is, in one breath, and the two ways in — connect
 *   and trade for real, or look around in practice mode with nothing at stake.
 * - Wallet connected: a welcome-back line with the wallet and its live value,
 *   so a returning user lands on their own numbers, not a pitch.
 */
export function Hero() {
  const { connected, publicKey } = useWallet();
  const { openConnect } = useConnectWallet();
  const { isLive } = useTradeMode();
  const { cashBalance, holdings, isLoaded } = useActivePortfolio();
  const profile = useProfile(publicKey?.toBase58());

  if (connected && publicKey) {
    const total = computeHoldings(holdings).reduce((sum, h) => sum + h.value, cashBalance);
    return (
      <header className="page-heading">
        <p className="eyebrow">{isLive ? "Live on Solana mainnet" : "Practice mode"}</p>
        <h1>
          Welcome back{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}<span className="text-violet-500">.</span>
        </h1>
        <p>
          {profile ? <span>@{profile.handle} · </span> : null}
          <span className="font-mono">{shortAddress(publicKey.toBase58())}</span>
          {isLoaded && (
            <>
              {" · "}
              <span className="font-mono">{formatCurrency(total)}</span> {isLive ? "in your wallet" : "practice balance"}
            </>
          )}
        </p>
        {profile === null && (
          <div className="mt-3">
            <ProfileButton className="rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-600" />
          </div>
        )}
      </header>
    );
  }

  return (
    <section className="relative mx-5 mt-5 mb-4 overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 sm:mx-7 sm:p-8">
      <div
        aria-hidden
        className="bg-gradient-brand pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-[0.14] blur-3xl"
      />
      <p className="eyebrow">Stocks on Solana</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
        Own a little of what&apos;s next<span className="text-violet-500">.</span>
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-neutral-600 sm:text-base">
        Real tokenized stocks and pre-IPO companies, priced live on Solana. Follow the wallets that hold them,
        practice with nothing at stake, and trade for real from your own wallet.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={openConnect} className="btn-primary">
          Connect wallet
        </button>
        <Link href="/markets" className="btn-secondary">
          Explore in practice mode
        </Link>
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <li>Live prices from Solana DEXes</li>
        <li>Real swaps via Jupiter</li>
        <li>Pre-IPO from two issuers</li>
        <li>No account, no custody</li>
      </ul>
    </section>
  );
}
