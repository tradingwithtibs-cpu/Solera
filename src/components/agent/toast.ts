"use client";

import { showToast } from "@/components/plans/toast-store";

/** The agent's toasts ride the plans toast store, so /agent has one host and one stack. */
export function toast(message: string, kind: "ok" | "warn" = "ok", link?: { href: string; label: string }) {
  showToast({ kind, message, ...(link ? { href: link.href, linkLabel: link.label } : {}) });
}
