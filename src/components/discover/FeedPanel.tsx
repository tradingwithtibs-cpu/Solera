"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Panel } from "@/components/panels/Panel";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { useNewsScopes, type NewsScope } from "@/hooks/use-news";
import { useSession } from "@/hooks/use-session";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { useFollowedInvestors } from "@/hooks/use-followed-investors";
import { useProfiles } from "@/hooks/use-profiles";
import { useFeed } from "@/hooks/use-feed";
import { getLivePrices, subscribeLivePrices } from "@/lib/live-prices";
import { PRE_IPO_MINTS } from "@/lib/pre-ipo";
import { useOwnerFills, useTape } from "./tape-store";
import { FEED_TABS, byRecency, fromLocalTransaction, fromPublicFill, type FeedFill, type FeedItem, type FeedTab } from "./feed";
import { hotMerge } from "./feed-posts";
import { NewsRow } from "./NewsRow";
import { FeedRow } from "./FeedRow";
import { StorySheet } from "./StorySheet";

const MAX_TICKER_SCOPES = 6;
const MAX_COMPANY_SCOPES = 3;

/**
 * The Discover card: News · Hot · Everyone · Following · Mine over real
 * headlines and real fills, with their votes and comment counts from the
 * posts store. Nothing here is seeded; every empty state is the honest
 * one from the copy sheet.
 */
export function FeedPanel({ id = "feed" }: { id?: string }) {
  const [tab, setTab] = useState<FeedTab>("hot");
  const [open, setOpen] = useState<FeedItem | null>(null);
  const close = useCallback(() => setOpen(null), []);

  // Re-render on price ticks so trails and since-fill figures stay live.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const feed = useFeed();
  const { postFor, at: feedAt } = feed;

  const { connected, publicKey } = useWallet();
  const { openConnect } = useConnectWallet();
  const address = publicKey?.toBase58() ?? null;
  const session = useSession();
  const signedOut = !connected && !session.signedIn;
  const { holdings, preIpoHoldings, transactions, mode } = useActivePortfolio();
  const { isFollowing } = useFollowedInvestors();

  // News for the market plus what the user holds.
  const heldTickers = holdings.map((h) => h.ticker).slice(0, MAX_TICKER_SCOPES);
  const heldCompanies = [...new Set(Object.keys(preIpoHoldings).map((m) => PRE_IPO_MINTS[m]?.company).filter(Boolean))].slice(0, MAX_COMPANY_SCOPES);
  const scopesKey = `${heldTickers.join(",")}|${heldCompanies.join(",")}`;
  const scopes = useMemo<NewsScope[]>(
    () => [{ kind: "general" }, ...heldTickers.map((ticker) => ({ kind: "ticker" as const, ticker })), ...heldCompanies.map((company) => ({ kind: "company" as const, company }))],
    // The joined key is the identity of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopesKey],
  );
  const news = useNewsScopes(scopes);
  const heldSet = useMemo(() => new Set<string>([...heldTickers, ...heldCompanies]), [heldTickers, heldCompanies]);

  // Fills from the tape, and the owner's own when signed in.
  const tape = useTape();
  const owner = session.signedIn ? session.owner : null;
  const ownerFills = useOwnerFills(owner);
  const isMine = useCallback((f: { owner: string; wallet: string | null }) => (!!owner && f.owner === owner) || (!!address && (f.wallet === address || f.owner === address)), [owner, address]);
  const fills = useMemo(() => tape.fills.map((f) => fromPublicFill(f, isMine(f))), [tape.fills, isMine]);
  const mine = useMemo<FeedFill[]>(() => {
    if (owner) return ownerFills.fills.map((f) => fromPublicFill(f, true));
    return transactions.map((t) => fromLocalTransaction(t, mode, address ?? "local")).sort(byRecency);
  }, [owner, ownerFills.fills, transactions, mode, address]);

  const rows = useMemo<FeedItem[]>(() => {
    switch (tab) {
      case "news":
        return news.items;
      case "hot":
        // The partner's score / (age + 2)^1.4 over real votes; the store's load time is the clock.
        return hotMerge<FeedItem>([...news.items, ...fills], (item) => postFor(item)?.score ?? 0, feedAt);
      case "all":
        return [...fills, ...news.items].sort(byRecency);
      case "following":
        return fills.filter((f) => (!!f.wallet && isFollowing(f.wallet)) || isFollowing(f.owner));
      case "mine":
        return mine;
    }
  }, [tab, news.items, fills, mine, isFollowing, postFor, feedAt]);

  // Names for every actor on screen, one batched request.
  const owners = useMemo(() => [...new Set(rows.filter((r): r is FeedFill => r.kind === "fill").map((f) => f.owner))], [rows]);
  const { get: profileFor } = useProfiles(owners);

  const fillsLoading = tab !== "news" && !tape.isLoaded;
  const mineLoading = tab === "mine" && !!owner && !ownerFills.isLoaded;
  const newsLoading = (tab === "news" || tab === "hot" || tab === "all") && !news.isLoaded;
  const loading = fillsLoading || mineLoading || newsLoading;
  const newsCount = news.isLoaded ? news.items.length : null;
  const followsAnyone = fills.some((f) => (!!f.wallet && isFollowing(f.wallet)) || isFollowing(f.owner));

  const tools = (
    <div className="feed-tools">
      <div className="seg" role="group" aria-label="Feed">
        {FEED_TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.key === "news" && newsCount !== null ? `News · ${newsCount}` : t.label}
          </button>
        ))}
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className="feed-skeleton" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  } else if (tab === "news" && news.error) {
    body = <p className="tr-empty feed-empty">{news.error}</p>;
  } else if (tab === "following" && tape.error && fills.length === 0) {
    body = <p className="tr-empty feed-empty">{tape.error}</p>;
  } else if ((tab === "hot" || tab === "all") && news.error && rows.length === 0) {
    body = <p className="tr-empty feed-empty">{news.error}</p>;
  } else if (rows.length === 0) {
    body = <FeedEmpty tab={tab} signedOut={signedOut} followsAnyone={followsAnyone} onConnect={openConnect} />;
  } else {
    body = (
      <>
        {tab === "mine" && !owner && (
          <p className="local-note eyebrow">
            <em>only in this browser</em>
          </p>
        )}
        {tab !== "news" && tab !== "mine" && tape.error && (
          <p className="local-note eyebrow">
            <em>{tape.error}</em>
          </p>
        )}
        {feed.error && (
          <p className="local-note eyebrow feed-error" role="status">
            <em className="warn">{feed.error}</em>
            <button type="button" className="tiny" onClick={feed.clearError} aria-label="Dismiss">
              ✕
            </button>
          </p>
        )}
        <ul className="posts">
          {rows.map((r) =>
            r.kind === "news" ? (
              <NewsRow key={r.id} item={r} post={postFor(r)} held={r.tickers.some((t) => heldSet.has(t))} onOpen={setOpen} />
            ) : (
              <FeedRow key={r.id} fill={r} post={postFor(r)} profile={profileFor(r.owner)} onOpen={setOpen} />
            ),
          )}
        </ul>
      </>
    );
  }

  return (
    <>
      <Panel id={id} title="Discover" subtitle={tape.isLoaded && tape.configured ? <span className="live-dot" aria-label="Tape updating" /> : undefined} tools={tools} className="feed-card" bodyClassName="feed-body">
        {body}
      </Panel>
      {open && <StorySheet item={open} profile={open.kind === "fill" ? profileFor(open.owner) : undefined} onClose={close} />}
    </>
  );
}

function FeedEmpty({ tab, signedOut, followsAnyone, onConnect }: { tab: FeedTab; signedOut: boolean; followsAnyone: boolean; onConnect: () => void }) {
  if (tab === "following") {
    return (
      <div className="empty-state feed-empty">
        <h2>{followsAnyone ? "Quiet from the people you follow." : "Follow someone on Leaderboard and their fills show up here."}</h2>
        {!followsAnyone && (
          <p>
            <Link href="/leaderboard" className="text-accent-text underline underline-offset-2">
              Open Leaderboard →
            </Link>
          </p>
        )}
      </div>
    );
  }
  if (tab === "mine") {
    return (
      <div className="empty-state feed-empty">
        <h2>Your fills land here with their notes.</h2>
        <p>
          Buy something in <Link href="/markets" className="text-accent-text underline underline-offset-2">Markets</Link> and it shows up here, practice or live.
        </p>
      </div>
    );
  }
  if (tab === "news") {
    return (
      <div className="empty-state feed-empty">
        <h2>No recent coverage.</h2>
      </div>
    );
  }
  return (
    <div className="empty-state feed-empty">
      <h2>Nothing on the tape yet.</h2>
      <p>Fills land here with their notes — yours and everyone&apos;s. Practice fills are labelled; on-chain fills link to Solscan.</p>
      {signedOut && (
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onConnect}>
            Connect wallet
          </button>
          <Link href="/markets" className="btn btn-secondary">
            Explore in practice mode
          </Link>
        </div>
      )}
    </div>
  );
}
