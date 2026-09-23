"use client";

import "./inbox.css";
import { useState } from "react";
import { useInbox } from "@/hooks/use-inbox";
import { Toasts } from "@/components/plans/Toasts";
import { InboxSheet } from "./InboxSheet";

/**
 * The bell in the top bar (agent-ux §3.3): `.btn-icon` with a 16px `--warn`
 * badge carrying the unread count in ink digits, never `--loss`. Renders
 * nothing when signed out (the inbox needs an owner). Opens InboxSheet.
 * Also hosts the toasts, so a plan that turns ready is announced on every
 * route, not only where a Plans card is mounted.
 */
export function InboxBell() {
  const { signedIn, unread } = useInbox();
  const [open, setOpen] = useState(false);
  if (!signedIn) return null;
  const label = unread > 0 ? `Inbox, ${unread} unread` : "Inbox";
  return (
    <>
      <button type="button" className="btn-ghost btn-icon ib-bell" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="ib-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && <InboxSheet onClose={() => setOpen(false)} />}
      <Toasts />
    </>
  );
}
