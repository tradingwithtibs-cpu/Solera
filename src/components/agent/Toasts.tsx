"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { dismissToast, useToasts, type ToastItem } from "./toast";

const subscribeNever = () => () => {};

function Toast({ item }: { item: ToastItem }) {
  const [shown, setShown] = useState(false);
  // The `.in` class a frame after mount so the globals.css transition plays.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`toast glass agent-toast ${item.kind} ${shown ? "in" : ""}`}>
      {item.message}
      {item.href && item.label && (
        <>
          {" "}
          <Link href={item.href} onClick={() => dismissToast(item.id)}>
            {item.label}
          </Link>
        </>
      )}
    </div>
  );
}

/** The `.toasts` stack, portalled to body: a card's container-type would otherwise box the fixed frame inside it. */
export function Toasts() {
  const items = useToasts();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!mounted || items.length === 0) return null;
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </div>,
    document.body,
  );
}
