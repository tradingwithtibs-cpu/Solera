"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { FeedNews } from "@/hooks/use-news";
import type { Profile } from "@/lib/profiles";
import { MESSAGE_MAX } from "@/lib/chat";
import { formatCurrency, formatPercent, formatRelativeTime, formatShares } from "@/lib/format";
import { getChange24h, getEffectivePrice, isLivePriced } from "@/lib/live-prices";
import { COMPANIES, type CompanyId } from "@/lib/pre-ipo";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { useFeed } from "@/hooks/use-feed";
import { openAuthSheet } from "@/components/auth/auth-sheet-store";
import { VoteColumn } from "./VoteColumn";
import { CommentList } from "./CommentList";
import { agentQuestion, scopeHref, scopeSymbol } from "./NewsRow";
import { actorName, fillSymbol, legLabel, type FeedFill, type FeedItem } from "./feed";
import { COMMENTS_LOCKED, LOCAL_FILL_LOCKED, feedTargetOf } from "./feed-posts";

/**
 * The story behind a headline, or the thread behind a fill. Real fields
 * only: the headline links to the publisher, "What it is" is the
 * provider's summary when there is one, "Who it touches" is the tickers
 * the story was fetched for at their live price. Beneath, the real thread
 * from the posts store and a composer that opens with sign-in.
 */
export function StorySheet({ item, profile, onClose }: { item: FeedItem; profile?: Profile | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const feed = useFeed();
  const post = feed.postFor(item);
  const target = feedTargetOf(item);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const body = item.kind === "news" ? <NewsStory item={item} /> : <FillThread fill={item} profile={profile} />;
  return createPortal(
    <div className="sheet scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-box wide glass glass-era" role="dialog" aria-modal="true" aria-labelledby="story-title">
        <div className="story">
          <div className="story-head">
            <VoteColumn target={target} post={post} />
            <div className="story-title">{item.kind === "news" ? <NewsTitle item={item} /> : <FillTitle fill={item} profile={profile} />}</div>
            <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {body}
          <div className="story-comments">
            <p className="eyebrow">Comments{post && post.commentCount > 0 ? ` · ${post.commentCount}` : ""}</p>
            <CommentList postId={post?.id || null} me={feed.owner} />
            <Composer item={item} locked={target.local} signedIn={feed.signedIn} onPost={(text) => feed.addComment(item, text)} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The comment box. Signed out it is off with a SIGN IN link; a fill that
 * lives only in this browser has no server row, so it is off with that
 * reason; signed in it posts and shows the route's reason when it refuses
 * (the 3-second cooldown says "Slow down a little.").
 */
function Composer({ item, locked, signedIn, onPost }: { item: FeedItem; locked: boolean; signedIn: boolean; onPost: (text: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placeholder = item.kind === "news" ? "Say something about this story…" : "Say something about this trade…";
  const reason = locked ? LOCAL_FILL_LOCKED : !signedIn ? COMMENTS_LOCKED : null;

  if (reason) {
    return (
      <form className="cmt-form" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <input disabled placeholder={reason} title={reason} aria-label="Comment" />
        </div>
        {locked ? (
          <button type="submit" className="btn btn-primary btn-small" disabled title={reason}>
            Post
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => openAuthSheet("signup")}>
            Sign in
          </button>
        )}
      </form>
    );
  }

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await onPost(text);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <form
        className="cmt-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label="Comment" maxLength={MESSAGE_MAX} disabled={sending} autoComplete="off" />
        </div>
        <button type="submit" className="btn btn-primary btn-small" disabled={!draft.trim() || sending} aria-busy={sending}>
          {sending ? "…" : "Post"}
        </button>
      </form>
      {error && (
        <p role="alert" className="field-error cmt-error">
          {error}
        </p>
      )}
    </>
  );
}

function NewsTitle({ item }: { item: FeedNews }) {
  const n = item.item;
  const kind = item.scope === "market" ? "MARKET" : item.scope === "company" ? "PRE-IPO" : scopeSymbol(item.tickers[0] ?? "");
  return (
    <>
      <p className="post-meta">
        <i className="post-tag">{kind}</i>
        <b>{n.source}</b>
        <span>· {formatRelativeTime(n.publishedAt)}</span>
      </p>
      <h3 id="story-title">
        <a href={n.url} target="_blank" rel="noreferrer">
          {n.headline} <span className="post-link">↗</span>
        </a>
      </h3>
    </>
  );
}

function NewsStory({ item }: { item: FeedNews }) {
  const n = item.item;
  const { tokens } = usePreIpo();
  const { holdings, preIpoHoldings } = useActivePortfolio();
  // Finnhub often repeats the headline (plus the source) as the summary; only a real summary earns the column.
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const summary = n.summary?.trim() ?? "";
  const hasSummary = summary.length > 0 && !squash(summary).startsWith(squash(n.headline)) && squash(summary) !== squash(n.headline);

  const touches = item.tickers.map((key) => {
    if (key in COMPANIES) {
      const company = COMPANIES[key as CompanyId];
      const issued = tokens.filter((t) => t.company === key && t.tokenPrice > 0);
      const heldUnits = issued.reduce((sum, t) => sum + (preIpoHoldings[t.mint] ?? 0), 0);
      return { key, label: scopeSymbol(key), name: company.name, href: "/pre-ipo", tokens: issued, held: heldUnits > 0 ? heldUnits : null, price: null as number | null, change: undefined as number | undefined };
    }
    const held = holdings.find((h) => h.ticker === key)?.shares ?? null;
    return { key, label: key, name: undefined as string | undefined, href: scopeHref(key), tokens: [], held, price: isLivePriced(key) ? getEffectivePrice(key) : null, change: getChange24h(key) };
  });

  return (
    <>
      {n.image && (
        <div className="story-img">
          {/* eslint-disable-next-line @next/next/no-img-element -- publisher image, unoptimized */}
          <img
            src={n.image}
            alt=""
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className={`story-cols ${hasSummary ? "" : "one"}`}>
        {hasSummary && (
          <div>
            <p className="eyebrow">What it is</p>
            <p className="story-text">{summary}</p>
          </div>
        )}
        <div>
          <p className="eyebrow">Who it touches</p>
          {touches.length === 0 ? (
            <p className="story-text muted">Market-wide coverage, not tied to one token.</p>
          ) : (
            <ul className="story-affects">
              {touches.map((t) => (
                <li key={t.key}>
                  <Link href={t.href}>
                    <b>{t.label}</b>
                    {t.price !== null ? <span>{formatCurrency(t.price)}</span> : t.tokens[0] ? <span>{formatCurrency(t.tokens[0].tokenPrice)}</span> : <span>—</span>}
                    {t.change !== undefined ? (
                      <em className={t.change >= 0 ? "up" : "down"}>{formatPercent(t.change)} 24h</em>
                    ) : t.tokens[0] ? (
                      <i className={t.tokens[0].premiumPct >= 0 ? "up" : "down"}>{formatPercent(t.tokens[0].premiumPct)} vs mark</i>
                    ) : (
                      <em />
                    )}
                    <small>
                      {t.name ?? ""}
                      {t.tokens.length > 1 ? ` · ${t.tokens.length} issuers` : ""}
                      {t.held !== null && <u> · you hold {formatShares(t.held)}</u>}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="story-foot">
        <span className="story-src">
          Source: <b>{n.source}</b> ·{" "}
          <a href={n.url} target="_blank" rel="noreferrer">
            read ↗
          </a>
        </span>
        <span className="story-actions">
          <Link className="tiny" href={`/agent?q=${encodeURIComponent(agentQuestion(item))}`}>
            ask agent
          </Link>
          {item.tickers[0] && (
            <Link className="tiny" href={scopeHref(item.tickers[0])}>
              open {scopeSymbol(item.tickers[0])}
            </Link>
          )}
        </span>
      </div>
      <p className="story-note">Descriptive only. What moved, who it touches, what to watch — never what to do.</p>
    </>
  );
}

function FillTitle({ fill, profile }: { fill: FeedFill; profile?: Profile | null }) {
  return (
    <>
      <p className="post-meta">
        <i className="post-tag">{fill.mode === "practice" ? "practice" : "on-chain"}</i>
        <b>{actorName(fill, profile)}</b>
        <span>· {formatRelativeTime(fill.at)}</span>
      </p>
      <h3 id="story-title">
        {fill.side === "buy" ? "Bought" : "Sold"} {formatShares(fill.quantity)} {fillSymbol(fill)} at {formatCurrency(fill.pricePerShare)}
      </h3>
      {fill.note && <blockquote>&ldquo;{fill.note}&rdquo;</blockquote>}
    </>
  );
}

function FillThread({ fill }: { fill: FeedFill; profile?: Profile | null }) {
  return (
    <div className="story-cols one">
      <div>
        {fill.wrongIf && (
          <>
            <p className="eyebrow">Wrong if</p>
            <p className="story-text">&ldquo;{fill.wrongIf}&rdquo;</p>
          </>
        )}
        {fill.leg && (
          <p className="story-text">
            This thesis is about <b>{legLabel(fill.leg)}</b>.
          </p>
        )}
        {!fill.wrongIf && !fill.leg && <p className="story-text muted">No thesis fields on this fill.</p>}
      </div>
    </div>
  );
}
