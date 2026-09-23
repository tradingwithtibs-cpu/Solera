"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Panel } from "@/components/panels/Panel";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { RoomPanel } from "@/components/rooms/RoomPanel";
import { useNews, useNewsScopes, type NewsScope } from "@/hooks/use-news";
import { useSession } from "@/hooks/use-session";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { useFollowedInvestors } from "@/hooks/use-followed-investors";
import { useInvestors } from "@/hooks/use-investors";
import { useProfiles } from "@/hooks/use-profiles";
import { useFeed } from "@/hooks/use-feed";
import { useRoomMessages } from "@/hooks/use-chat";
import { useAuthorsMessages, useFollowedActivity, useRoomsMessages } from "@/hooks/use-chat-feed";
import { useNow } from "@/components/portfolio/use-now";
import { LOBBY_ROOM } from "@/lib/chat";
import { getLivePrices, subscribeLivePrices } from "@/lib/live-prices";
import { isOwner, isWalletAddress } from "@/lib/owner";
import { computeTrendingTickers } from "@/lib/portfolio";
import { PRE_IPO_MINTS } from "@/lib/pre-ipo";
import { useTape } from "./tape-store";
import { FEED_TABS, NEWS_WINDOW_MS, byRecency, fromMessage, fromPublicFill, relevance, withinWindow, type FeedFill, type FeedItem, type FeedStory, type FeedTab } from "./feed";
import { hotMerge } from "./feed-posts";
import { NewsRow } from "./NewsRow";
import { FeedRow } from "./FeedRow";
import { MessageRow } from "./MessageRow";
import { StorySheet } from "./StorySheet";

const MAX_TICKER_SCOPES = 6;
const MAX_COMPANY_SCOPES = 3;
const MAX_TRENDING_SCOPES = 8;
const MAX_FOLLOWED_WALLETS = 10;
/** Hot is a shortlist, not the whole pool. */
const HOT_LIMIT = 40;

/**
 * The Discover card, five tabs over real data, nothing seeded:
 *
 * - News      the last 24 hours of headlines, newest first: the market,
 *             the tickers most held on-chain (Trending), and what you hold.
 * - Hot       the same headlines ranked by votes and comments with the
 *             partner's decay; ties go to stories about held tickers.
 * - Everyone  one lobby room for every user, with the composer.
 * - Following trades by the people you follow (recorded in Solera or read
 *             from the chain) and their room posts, by time.
 * - Holdings  news and room posts for what you currently hold.
 */
export function FeedPanel({ id = "feed" }: { id?: string }) {
  const [tab, setTab] = useState<FeedTab>("news");
  const [open, setOpen] = useState<FeedStory | null>(null);
  const close = useCallback(() => setOpen(null), []);
  // The minute clock; null on the server and the first paint, when the window is left open.
  const now = useNow();
  const windowMs = now === null ? null : NEWS_WINDOW_MS;

  // Re-render on price ticks so trails and since-fill figures stay live.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const feed = useFeed();
  const { postFor, at: feedAt } = feed;

  const { connected, publicKey } = useWallet();
  const { openConnect } = useConnectWallet();
  const address = publicKey?.toBase58() ?? null;
  const session = useSession();
  const signedOut = !connected && !session.signedIn;
  const owner = session.signedIn ? session.owner : null;
  const { holdings, preIpoHoldings } = useActivePortfolio();
  const { isFollowing, followed } = useFollowedInvestors();
  const { investors, source: investorsSource } = useInvestors();

  // --- what you hold, and what the platform holds most -------------------
  const heldTickers = holdings.map((h) => h.ticker).slice(0, MAX_TICKER_SCOPES);
  const heldCompanies = [...new Set(Object.keys(preIpoHoldings).map((m) => PRE_IPO_MINTS[m]?.company).filter(Boolean))].slice(0, MAX_COMPANY_SCOPES);
  const trendingTickers = useMemo(
    () => (investorsSource === "chain" ? computeTrendingTickers(investors).slice(0, MAX_TRENDING_SCOPES).map((t) => t.ticker) : []),
    [investors, investorsSource],
  );
  const heldKey = `${heldTickers.join(",")}|${heldCompanies.join(",")}`;
  const marketKey = `${heldKey}|${trendingTickers.join(",")}`;
  const marketScopes = useMemo<NewsScope[]>(
    () => [
      { kind: "general" },
      ...[...new Set([...trendingTickers, ...heldTickers])].map((ticker) => ({ kind: "ticker" as const, ticker })),
      ...heldCompanies.map((company) => ({ kind: "company" as const, company })),
    ],
    // The joined key is the identity of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketKey],
  );
  const heldScopes = useMemo<NewsScope[]>(
    () => [...heldTickers.map((ticker) => ({ kind: "ticker" as const, ticker })), ...heldCompanies.map((company) => ({ kind: "company" as const, company }))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heldKey],
  );
  const marketNews = useNewsScopes(marketScopes);
  const heldNews = useNewsScopes(heldScopes);
  // The market stream alone decides when News and Hot stop showing bones: ticker scopes merge in as they arrive.
  const general = useNews({ kind: "general" });
  const heldSet = useMemo(() => new Set<string>([...heldTickers, ...heldCompanies]), [heldTickers, heldCompanies]);

  // --- rooms: the lobby (live, with posting), what you hold (read) --------
  const lobby = useRoomMessages(tab === "all" ? LOBBY_ROOM : undefined);
  const heldRooms = useRoomsMessages(tab === "holdings" ? heldTickers : []);

  // --- the people you follow: Solera fills, on-chain swaps, their posts ---
  // Real people only: the sample roster's ids from an older visit are neither wallets nor accounts.
  const followedList = useMemo(() => [...followed].filter(isOwner), [followed]);
  const followedWallets = useMemo(() => followedList.filter(isWalletAddress).slice(0, MAX_FOLLOWED_WALLETS), [followedList]);
  const tape = useTape();
  const isMine = useCallback((f: { owner: string; wallet: string | null }) => (!!owner && f.owner === owner) || (!!address && (f.wallet === address || f.owner === address)), [owner, address]);
  const followedSoleraFills = useMemo(
    () => tape.fills.filter((f) => (!!f.wallet && isFollowing(f.wallet)) || isFollowing(f.owner)).map((f) => fromPublicFill(f, isMine(f))),
    [tape.fills, isFollowing, isMine],
  );
  const chain = useFollowedActivity(tab === "following" ? followedWallets : []);
  const followedPosts = useAuthorsMessages(tab === "following" ? followedList : []);

  const rows = useMemo<FeedItem[]>(() => {
    switch (tab) {
      case "news":
        return withinWindow(marketNews.items, now ?? 0, windowMs).sort(byRecency);
      case "hot":
        return hotMerge(marketNews.items, (item) => postFor(item)?.score ?? 0, feedAt, (item) => (item.kind === "news" ? relevance(item) : 0)).slice(0, HOT_LIMIT);
      case "all":
        return [];
      case "following": {
        const seen = new Set(followedSoleraFills.map((f) => f.signature).filter(Boolean));
        const onChain = chain.fills.filter((f) => !f.signature || !seen.has(f.signature)).map((f) => fromPublicFill(f, false));
        return [...followedSoleraFills, ...onChain, ...followedPosts.messages.map(fromMessage)].sort(byRecency);
      }
      case "holdings":
        return [...heldNews.items, ...heldRooms.messages.map(fromMessage)].sort(byRecency);
    }
  }, [tab, marketNews.items, heldNews.items, now, windowMs, postFor, feedAt, followedSoleraFills, chain.fills, followedPosts.messages, heldRooms.messages]);

  // Names for every actor on screen, one batched request.
  const owners = useMemo(() => [...new Set(rows.filter((r): r is FeedFill => r.kind === "fill").map((f) => f.owner))], [rows]);
  const { get: profileFor } = useProfiles(owners);

  const loading =
    (tab === "news" || tab === "hot") && !general.isLoaded
      ? true
      : tab === "following"
        ? !tape.isLoaded || !chain.isLoaded || !followedPosts.isLoaded
        : tab === "holdings"
          ? !heldNews.isLoaded || !heldRooms.isLoaded
          : false;
  const newsCount = general.isLoaded ? withinWindow(marketNews.items, now ?? 0, windowMs).length : null;
  const followsAnyone = followedList.length > 0;
  const holdsAnything = heldTickers.length > 0 || heldCompanies.length > 0;

  const tools = (
    <div className="feed-tools">
      <div className="seg" role="group" aria-label="Feed">
        {FEED_TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "news" && newsCount !== null && <small className="tab-count"> · {newsCount}</small>}
          </button>
        ))}
      </div>
    </div>
  );

  const softError =
    tab === "following" ? (tape.error ?? chain.error ?? followedPosts.error) : tab === "holdings" ? (heldNews.error ?? heldRooms.error) : (tab === "news" || tab === "hot") && rows.length > 0 ? marketNews.error : null;

  let body: React.ReactNode;
  if (tab === "all") {
    body = (
      <div className="lobby">
        <RoomPanel ticker={LOBBY_ROOM} room={lobby} label="Everyone" />
      </div>
    );
  } else if (loading) {
    body = (
      <div className="feed-skeleton" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  } else if ((tab === "news" || tab === "hot") && general.error && rows.length === 0) {
    body = <p className="tr-empty feed-empty">{general.error}</p>;
  } else if (rows.length === 0) {
    body = <FeedEmpty tab={tab} signedOut={signedOut} followsAnyone={followsAnyone} holdsAnything={holdsAnything} onConnect={openConnect} />;
  } else {
    body = (
      <>
        {softError && (
          <p className="local-note eyebrow">
            <em>{softError}</em>
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
            ) : r.kind === "fill" ? (
              <FeedRow key={r.id} fill={r} post={postFor(r)} profile={profileFor(r.owner)} onOpen={setOpen} />
            ) : (
              <MessageRow key={r.id} item={r} mine={!!owner && r.message.author === owner} />
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

function FeedEmpty({ tab, signedOut, followsAnyone, holdsAnything, onConnect }: { tab: FeedTab; signedOut: boolean; followsAnyone: boolean; holdsAnything: boolean; onConnect: () => void }) {
  if (tab === "following") {
    return (
      <div className="empty-state feed-empty">
        <h2>{followsAnyone ? "Quiet from the people you follow." : "Follow someone on Leaderboard and their trades and posts show up here."}</h2>
        {followsAnyone ? (
          <p>Their trades, on Solera or on-chain, and anything they say in a room land here as they happen.</p>
        ) : (
          <p>
            <Link href="/leaderboard" className="text-accent-text underline underline-offset-2">
              Open Leaderboard →
            </Link>
          </p>
        )}
      </div>
    );
  }
  if (tab === "holdings") {
    return (
      <div className="empty-state feed-empty">
        <h2>{holdsAnything ? "Nothing new about what you hold." : "News and room posts about what you hold land here."}</h2>
        {!holdsAnything && (
          <p>
            Buy something in <Link href="/markets" className="text-accent-text underline underline-offset-2">Markets</Link>, practice or live, and its coverage and its room follow you here.
          </p>
        )}
        {holdsAnything && signedOut && (
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary" onClick={onConnect}>
              Connect wallet
            </button>
          </div>
        )}
      </div>
    );
  }
  if (tab === "hot") {
    return (
      <div className="empty-state feed-empty">
        <h2>Nothing is trending yet.</h2>
      </div>
    );
  }
  return (
    <div className="empty-state feed-empty">
      <h2>No coverage in the last 24 hours.</h2>
    </div>
  );
}
