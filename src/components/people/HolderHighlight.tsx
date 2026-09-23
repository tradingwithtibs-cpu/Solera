"use client";

import { useEffect } from "react";
import { useInvestors } from "@/hooks/use-investors";

/**
 * Holder overlap (pages.md §2.7): hover anything carrying `data-holder={id}`
 * and every element with `data-sym` for a ticker that wallet holds gets
 * `.hl` (styled in people.css); `body.hl-on` lets the rest dim. Holdings
 * come from the investors store, so it only ever lights up real positions.
 * Renders nothing.
 */
export function HolderHighlight() {
  const { investors } = useInvestors();
  // A string key, so the listeners re-bind only when holdings change, not on every price tick.
  const key = investors.map((i) => `${i.id}:${i.holdings.map((h) => h.ticker).join("+")}`).join("|");

  useEffect(() => {
    const held = new Map<string, Set<string>>();
    if (key) {
      for (const entry of key.split("|")) {
        const at = entry.indexOf(":");
        held.set(entry.slice(0, at), new Set(entry.slice(at + 1).split("+").filter(Boolean)));
      }
    }
    const holderOf = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? (target.closest("[data-holder]") as HTMLElement | null) : null;
    const clear = () => {
      document.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
      document.body.classList.remove("hl-on");
    };
    const over = (e: PointerEvent) => {
      const el = holderOf(e.target);
      if (!el) return;
      const tickers = held.get(el.dataset.holder ?? "");
      if (!tickers) return;
      document.querySelectorAll<HTMLElement>("[data-sym]").forEach((r) => r.classList.toggle("hl", tickers.has(r.dataset.sym ?? "")));
      document.body.classList.add("hl-on");
    };
    const out = (e: PointerEvent) => {
      const el = holderOf(e.target);
      if (!el) return;
      const to = e.relatedTarget;
      if (to instanceof Node && el.contains(to)) return; // moved within the same row
      clear();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      clear();
    };
  }, [key]);

  return null;
}
