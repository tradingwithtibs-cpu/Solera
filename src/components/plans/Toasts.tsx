"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { dismissToast, nextHostId, pauseToast, registerHost, resumeToast, usePrimaryHost, useToasts } from "./toast-store";

const subscribeNever = () => () => {};

/**
 * The toast host (design-system §4.12): fixed bottom-right, above the tab
 * bar on phones, `role="status"`. Portalled to the body like the sheets,
 * because a glass top bar or a sized panel would otherwise box a fixed
 * element inside itself. Several panels may mount it; only the first
 * mounted instance renders, so a toast never shows twice.
 */
export function Toasts() {
  const [hostId] = useState(nextHostId);
  const primary = usePrimaryHost();
  const toasts = useToasts();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => registerHost(hostId), [hostId]);

  if (!mounted || primary !== hostId) return null;
  return createPortal(
    <div className="toasts pl-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast glass in pl-toast ${t.kind === "ok" ? "ok" : t.kind === "warn" ? "warn" : ""}`}
          onMouseEnter={() => pauseToast(t.id)}
          onMouseLeave={() => resumeToast(t.id)}
        >
          <span>{t.message}</span>
          {t.href && (
            <Link href={t.href} onClick={() => dismissToast(t.id)}>
              {t.linkLabel ?? "open"}
            </Link>
          )}
          <button type="button" className="pl-toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
