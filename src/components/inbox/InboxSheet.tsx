"use client";

import "./inbox.css";
import { useId } from "react";
import Link from "next/link";
import { Sheet, SheetHead } from "@/components/auth/Sheet";
import { useInbox } from "@/hooks/use-inbox";
import type { InboxItem } from "@/lib/plans-client";
import { INBOX_EMPTY, INBOX_FOOT, relTime } from "@/components/plans/plan-format";
import { useClock } from "@/components/plans/use-clock";

const KIND_LABEL: Record<string, { label: string; tone: string }> = {
  plan_ready: { label: "Ready to sign", tone: "ib-ready" },
  plan_filled: { label: "Filled", tone: "ib-filled" },
  plan_failed: { label: "Failed", tone: "ib-failed" },
  plan_expired: { label: "Expired", tone: "" },
  plan_cancelled: { label: "Cancelled", tone: "" },
};

function kindOf(kind: string): { label: string; tone: string } {
  return KIND_LABEL[kind] ?? { label: kind.replace(/^plan_/, "").replace(/_/g, " "), tone: "" };
}

/**
 * The inbox (agent-ux §3.3 step 2): one row per notification, newest
 * first. A `plan_ready` row carries OPEN TICKET to the prefilled ticket;
 * the other kinds are informational with "view in plans". Opening a row
 * marks it read. Delivery is in-app only this week, and the foot says so.
 */
export function InboxSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const { items, unread, error, unavailable, markRead } = useInbox();
  const now = useClock();

  const open = (item: InboxItem) => {
    void markRead([item.id]);
    onClose();
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      <SheetHead eyebrow="Inbox" title="Inbox" id={titleId} onClose={onClose} />
      <p className="ib-sub">{unread === 1 ? "1 unread" : `${unread} unread`}</p>
      {unavailable ? (
        <p className="ib-empty">The inbox isn&apos;t enabled on this deployment yet.</p>
      ) : items === null ? (
        error ? (
          <p className="ib-empty" role="alert">
            {error}
          </p>
        ) : (
          <div className="skeleton" style={{ height: 48, borderRadius: "var(--radius-control)" }} aria-busy="true" aria-label="Loading your inbox" />
        )
      ) : items.length === 0 ? (
        <p className="ib-empty">{INBOX_EMPTY}</p>
      ) : (
        <ul className="ib-list" aria-label="Notifications">
          {items.map((item) => {
            const k = kindOf(item.kind);
            const isReady = item.kind === "plan_ready";
            const href = isReady && item.href ? item.href : "/portfolio";
            return (
              <li key={item.id} className={`ib-row ${item.readAt === null ? "unread" : ""}`}>
                <div className="ib-main">
                  <p className="ib-meta">
                    {item.readAt === null && <span className="ib-dot" aria-label="unread" />}
                    <span className={`chip ${k.tone}`}>{k.label}</span>
                    <time dateTime={new Date(item.createdAt).toISOString()}>{now ? `${relTime(item.createdAt, now)} ago` : ""}</time>
                  </p>
                  <p className="ib-title">{item.title}</p>
                  <p className="ib-body">{item.body}</p>
                  {isReady && <p className="ib-body">Solera will notify you when the price is there and prefill the ticket; you tap once to sign. Nothing is signed on your behalf.</p>}
                </div>
                <div className="ib-actions">
                  {isReady ? (
                    <Link href={href} className="btn-live btn-small" onClick={() => open(item)}>
                      Open ticket
                    </Link>
                  ) : (
                    <Link href={href} className="btn-ghost btn-small" onClick={() => open(item)}>
                      view in plans
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sheet-foot">{INBOX_FOOT}</p>
    </Sheet>
  );
}
