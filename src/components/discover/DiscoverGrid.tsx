"use client";

import "./discover.css";
import { useWallet } from "@solana/wallet-adapter-react";
import { PanelGrid } from "@/components/panels/PanelGrid";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";
import { useSession } from "@/hooks/use-session";
import { WelcomePanel } from "./WelcomePanel";
import { FeedPanel } from "./FeedPanel";
import { TrendingPanel } from "./TrendingPanel";

/** Discover: the feed beside Trending on the panel grid, with the welcome card above it for visitors. */
export function DiscoverGrid() {
  const { connected } = useWallet();
  const { signedIn } = useSession();
  const signedOut = !connected && !signedIn;
  return (
    <>
      {signedOut && (
        <div className="welcome-wrap">
          <WelcomePanel />
        </div>
      )}
      <PanelGrid page="discover" phoneTab="discover">
        <FeedPanel id="feed" />
        <TrendingPanel id="trending" />
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="discover" />
      </p>
    </>
  );
}
