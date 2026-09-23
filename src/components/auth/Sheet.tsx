"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  /** Accessible name when no visible heading carries it. */
  label?: string;
  /** The id of the visible heading, when there is one. */
  labelledBy?: string;
  onClose: () => void;
  /** While true the scrim and Escape do nothing: a wallet signature is pending. */
  locked?: boolean;
  /** The 440px box (auth, profile) instead of the 520px default. */
  narrow?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * The one dialog shell every sheet shares (design-system §4.7): scrim,
 * glass box with the era hairline, bottom sheet on phones and centred
 * above 720px. Focus moves inside on open, stays inside on Tab, and goes
 * back to the opener on close. Escape and the scrim close it unless locked.
 */
export function Sheet({ label, labelledBy, onClose, locked = false, narrow = false, className = "", children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, locked });

  useEffect(() => {
    latest.current = { onClose, locked };
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getAttribute("aria-hidden") !== "true");
    (focusables()[0] ?? box).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (latest.current.locked) return;
        e.stopPropagation();
        latest.current.onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    box.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="sheet scrim"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`sheet-box glass glass-era outline-none ${narrow ? "narrow" : ""} ${className}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}

/** Eyebrow, title and the close button, laid out as `.sheet-head`. */
export function SheetHead({
  eyebrow,
  title,
  id,
  onClose,
  closeLabel = "Close",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  id?: string;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <header className="sheet-head">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h3 id={id}>{title}</h3>
      </div>
      {onClose && (
        <button type="button" className="btn-ghost btn-icon -mr-2 -mt-1 text-base" aria-label={closeLabel} onClick={onClose}>
          ✕
        </button>
      )}
    </header>
  );
}
