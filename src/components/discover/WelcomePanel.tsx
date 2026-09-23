"use client";

import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { useConnectWallet } from "@/components/ConnectWalletProvider";

/**
 * The compact welcome above the grid for visitors with no wallet and no
 * account: what Solera is in one breath and the two ways in. Signed in,
 * the grid starts at the top.
 */
export function WelcomePanel() {
  const { openConnect } = useConnectWallet();
  return (
    <Panel static hero title="Welcome" subtitle="stocks on Solana">
      <div className="welcome">
        <div className="welcome-copy">
          <h1>
            Own a little of what&apos;s next<em>.</em>
          </h1>
          <p>
            Real tokenized stocks and pre-IPO companies, priced live on Solana. Follow the wallets that hold them, practice with nothing at stake, and trade for real from
            your own wallet.
          </p>
        </div>
        <div className="welcome-actions">
          <button type="button" onClick={openConnect} className="btn btn-primary">
            Connect wallet
          </button>
          <Link href="/markets" className="btn btn-secondary">
            Explore in practice mode
          </Link>
        </div>
        <ul className="welcome-facts">
          <li className="chip">Live prices from Solana DEXes</li>
          <li className="chip">Real swaps via Jupiter</li>
          <li className="chip">Pre-IPO from two issuers</li>
          <li className="chip">No account, no custody</li>
        </ul>
      </div>
    </Panel>
  );
}
