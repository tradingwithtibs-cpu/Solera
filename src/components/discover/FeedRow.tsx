"use client";

import Link from "next/link";
import type { Profile } from "@/lib/profiles";
import type { FeedPost } from "@/lib/feed";
import { formatCurrency, formatPercent, formatRelativeTime, formatShares } from "@/lib/format";
import { getEffectiveHistory, getEffectivePrice, isLiveHistory, isLivePriced } from "@/lib/live-prices";
import { avatarColorFor } from "@/lib/investors";
import { getTickerInfo, isKnownTicker } from "@/lib/catalog";
import { solscanTxUrl } from "@/lib/jupiter";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { TickerBadge } from "@/components/TickerBadge";
import { ChatIcon } from "@/components/icons";
import { VoteColumn } from "./VoteColumn";
import { Spark } from "./Spark";
import { actorInitials, actorName, fillSymbol, legLabel, shortSignature, sinceFillPct, type FeedFill } from "./feed";
import { commentLabel, feedTargetOf } from "./feed-posts";

/**
 * One fill on the feed: who, what, at what price, when; practice or
 * on-chain; the note (or "no note"); the leg and the source; how the
 * ticker has moved since the fill printed; Copy (never on your own fills)
 * and the thread. Prices come from the live store, so a row only draws a
 * trail when real history exists. `post` is the fill's row in the posts
 * store, absent until anyone has voted or commented.
 */
export function FeedRow({ fill, post, profile, onOpen }: { fill: FeedFill; post?: FeedPost; profile: Profile | null | undefined; onOpen: (fill: FeedFill) => void }) {
  const { tokens } = usePreIpo();
  const symbol = fillSymbol(fill);
  const name = actorName(fill, profile);
  const initials = actorInitials(fill, profile);
  const actorKey = fill.wallet ?? fill.owner;

  let price: number | null = null;
  let trail: number[] | null = null;
  if (fill.ticker) {
    if (isLivePriced(fill.ticker)) price = getEffectivePrice(fill.ticker);
    if (isLiveHistory(fill.ticker, "7d")) trail = [fill.pricePerShare, ...getEffectiveHistory(fill.ticker, "7d").slice(-11)];
  } else if (fill.mint) {
    const token = tokens.find((t) => t.mint === fill.mint);
    if (token && token.tokenPrice > 0) price = token.tokenPrice;
  }
  const since = price !== null ? sinceFillPct(fill, price) : null;
  const canCopy = !fill.mine && !!fill.ticker && !!fill.wallet;

  return (
    <li className={`post fill ${fill.side}`} data-sym={symbol}>
      <VoteColumn target={feedTargetOf(fill)} post={post} />
      {fill.wallet ? (
        <Link href={`/investor/${fill.wallet}`} className="avatar sm" style={{ "--tk": avatarColorFor(actorKey) } as React.CSSProperties} aria-label={`${name}'s wallet`}>
          {initials}
        </Link>
      ) : (
        <span className="avatar sm" style={{ "--tk": avatarColorFor(actorKey) } as React.CSSProperties}>
          {initials}
        </span>
      )}
      <div className="post-body">
        <p className="fill-line">
          {fill.wallet ? (
            <Link href={`/investor/${fill.wallet}`}>
              <b>{name}</b>
            </Link>
          ) : (
            <b>{name}</b>
          )}{" "}
          {fill.side === "buy" ? "bought" : "sold"}{" "}
          <b className="qty">
            {formatShares(fill.quantity)} {symbol}
          </b>{" "}
          at <span className="mono">{formatCurrency(fill.pricePerShare)}</span>{" "}
          <small>
            · {formatRelativeTime(fill.at)} ·{" "}
            {fill.mode === "practice" ? (
              <span className="chip practice">practice</span>
            ) : fill.signature ? (
              <a className="chip live" href={solscanTxUrl(fill.signature)} target="_blank" rel="noreferrer" title="View on Solscan">
                on-chain {shortSignature(fill.signature)} ↗
              </a>
            ) : (
              <span className="chip live">on-chain</span>
            )}
          </small>
        </p>
        {fill.note ? <blockquote>&ldquo;{fill.note}&rdquo;</blockquote> : <small className="no-note">no note</small>}
        {(fill.leg || fill.via !== "ticket") && (
          <span className="post-tags">
            {fill.leg && <span className="chip mark">thesis: {legLabel(fill.leg)}</span>}
            {fill.via !== "ticket" && <span className="chip">via {fill.via}</span>}
          </span>
        )}
        <span className="row-actions">
          {canCopy && (
            <Link className="tiny copy" href={`/buy/${encodeURIComponent(fill.ticker!)}?ref=${encodeURIComponent(fill.wallet!)}`} title="Copy this trade">
              Copy
            </Link>
          )}
          <button type="button" className="tiny" onClick={() => onOpen(fill)} title="Open the thread">
            <ChatIcon className="h-3 w-3" />
            {commentLabel(post?.commentCount ?? 0)}
          </button>
        </span>
      </div>
      {(trail || since !== null) && (
        <span className="trail" title="This ticker since the trade printed">
          {trail && <Spark values={trail} />}
          {since !== null && <small className={since >= 0 ? "up" : "down"}>{formatPercent(since)}</small>}
        </span>
      )}
      {fill.ticker && isKnownTicker(fill.ticker) ? (
        <span className="post-badge">
          <TickerBadge ticker={getTickerInfo(fill.ticker)} />
        </span>
      ) : (
        <span className="post-badge">
          <span className="chip">{symbol}</span>
        </span>
      )}
    </li>
  );
}
