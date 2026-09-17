"use client";

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTradeMode } from "@/hooks/use-trade-mode";

/**
 * The thin status line above every screen. It answers the one question a
 * user (or a judge) has at all times: is what I'm looking at real?
 * - Live: wallet connected, trades settle on Solana.
 * - Practice by choice: wallet connected but the user switched to practice.
 * - Practice because no wallet: one tap to connect and go live.
 */
export function ModeStrip() {
  const { isLive, connected, setMode } = useTradeMode();
  const { setVisible } = useWalletModal();

  if (isLive) {
    return (
      <div className="demo-strip">
        <span>
          <span className="status-dot" />
          Live · Solana mainnet
        </span>
        <span>Real prices · Real trades via Jupiter</span>
      </div>
    );
  }

  return (
    <div className="demo-strip">
      <span>
        <span className="status-dot" />
        Practice mode
      </span>
      <button
        type="button"
        onClick={() => (connected ? setMode("live") : setVisible(true))}
        className="font-semibold text-violet-600"
      >
        {connected ? "Switch to live trading" : "Connect a wallet to trade for real"}
      </button>
    </div>
  );
}
