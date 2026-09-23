"use client";

import Link from "next/link";
import type { FeedNews } from "@/hooks/use-news";
import type { FeedPost } from "@/lib/feed";
import { formatRelativeTime } from "@/lib/format";
import { COMPANIES, PRESTOCKS_SYMBOLS, type CompanyId } from "@/lib/pre-ipo";
import { VoteColumn } from "./VoteColumn";
import { commentLabel, feedTargetOf } from "./feed-posts";

/** The chip text for a scope key: an xStock ticker as is, a company id as its PreStocks symbol. */
export function scopeSymbol(key: string): string {
  const preSymbol = Object.entries(PRESTOCKS_SYMBOLS).find(([, id]) => id === key)?.[0];
  return preSymbol ?? (key in COMPANIES ? COMPANIES[key as CompanyId].name.toUpperCase() : key);
}

/** Where "open X" goes: the asset card for an xStock, the pre-IPO page for a company. */
export function scopeHref(key: string): string {
  return key in COMPANIES ? "/pre-ipo" : `/asset/${encodeURIComponent(key)}`;
}

export function agentQuestion(item: FeedNews): string {
  const headline = item.item.headline.slice(0, 80);
  const about = item.tickers[0] ? scopeSymbol(item.tickers[0]) : "the market";
  return `What does "${headline}" mean for ${about}?`;
}

/**
 * One headline: vote column, kind tag, source, age, the tickers it was
 * fetched for, "you hold this", the headline (opens the story sheet; ↗ is
 * the publisher's link), the thumbnail when the publisher allows it, and
 * the three actions. Everything shown is the item the route returned;
 * `post` is its row in the posts store, absent until anyone has voted.
 */
export function NewsRow({ item, post, held, onOpen }: { item: FeedNews; post?: FeedPost; held: boolean; onOpen: (item: FeedNews) => void }) {
  const n = item.item;
  const kind = item.scope === "market" ? "MARKET" : item.scope === "company" ? "PRE-IPO" : scopeSymbol(item.tickers[0] ?? "");
  const first = item.tickers[0];
  return (
    <li className={`post news-post ${n.image ? "has-img" : "no-img"}`} data-sym={first ?? undefined}>
      <VoteColumn target={feedTargetOf(item)} post={post} />
      <div className="post-body">
        <p className="post-meta">
          <i className="post-tag">{kind}</i>
          <b>{n.source}</b>
          <span>· {formatRelativeTime(n.publishedAt)}</span>
          {item.tickers.map((t) => (
            <Link key={t} href={scopeHref(t)} className="post-sym">
              {scopeSymbol(t)}
            </Link>
          ))}
          {held && <em className="you-hold">· you hold this</em>}
        </p>
        <p className="post-hl">
          {/* A span, not a <button>: buttons are blockified to inline-block and cannot wrap, which strands the ↗ on its own line. */}
          <span
            role="button"
            tabIndex={0}
            className="post-hl-open"
            onClick={() => onOpen(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(item);
              }
            }}
          >
            {n.headline}
          </span>
          {" "}
          <a className="post-link" href={n.url} target="_blank" rel="noreferrer" title="Read at the source" aria-label="Read at the source">
            ↗
          </a>
        </p>
        {n.image && (
          <button type="button" className="post-img" onClick={() => onOpen(item)} aria-label="Open story">
            {/* eslint-disable-next-line @next/next/no-img-element -- external, unoptimized thumbnails from many hosts */}
            <img
              src={n.image}
              alt=""
              loading="lazy"
              onError={(e) => {
                // Publishers often block hotlinking; drop the box rather than show a broken frame.
                const li = e.currentTarget.closest(".news-post");
                li?.classList.remove("has-img");
                li?.classList.add("no-img");
                e.currentTarget.parentElement!.style.display = "none";
              }}
            />
          </button>
        )}
        <p className="post-actions">
          <button type="button" className="tiny" onClick={() => onOpen(item)} title="Open the thread">
            {commentLabel(post?.commentCount ?? 0)}
          </button>
          <Link className="tiny" href={`/agent?q=${encodeURIComponent(agentQuestion(item))}`}>
            ask agent
          </Link>
          {first && (
            <Link className="tiny" href={scopeHref(first)}>
              open {scopeSymbol(first)}
            </Link>
          )}
        </p>
      </div>
    </li>
  );
}
