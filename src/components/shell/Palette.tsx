"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getAllTickerInfos } from "@/lib/catalog";
import { useCatalog } from "@/hooks/use-catalog";
import { useInvestors } from "@/hooks/use-investors";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { useConnectWallet } from "../ConnectWalletProvider";
import { getEffectivePrice, getLivePrices, isLivePriced, subscribeLivePrices } from "@/lib/live-prices";
import { getPreIpoTokens, usePreIpo } from "@/hooks/use-pre-ipo";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/format";

/* Open/close from anywhere (the top-bar button, ⌘K) through a tiny store. */
let open = false;
const listeners = new Set<() => void>();
export function openPalette() {
  open = true;
  listeners.forEach((l) => l());
}
function closePalette() {
  open = false;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

interface Result {
  kind: string;
  label: string;
  figure?: string;
  go: () => void;
}

const HINT = 'Try · "who holds nvda" · "openai gap" · "go live" · "practice"';

/** ⌘K: tickers, pre-IPO names, people, and a few plain-word intents. Everything it lists is real. */
export function Palette() {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => false);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { investors } = useInvestors();
  const { setMode, connected } = useTradeMode();
  const { openConnect } = useConnectWallet();
  useCatalog();
  usePreIpo();
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      } else if (e.key === "Escape" && open) {
        closePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const go = (href: string) => () => {
      closePalette();
      router.push(href);
    };
    const out: Result[] = [];
    if (!q) return out;

    const who = q.match(/^who holds (.+)$/);
    if (who) {
      const sym = who[1].trim().toUpperCase();
      const target = sym.endsWith("X") ? sym.slice(0, -1) + "x" : sym + "x";
      investors
        .map((inv) => ({ inv, h: computeHoldings(inv.holdings).find((x) => x.ticker === target) }))
        .filter((e): e is { inv: (typeof investors)[number]; h: NonNullable<typeof e.h> } => !!e.h)
        .sort((a, b) => b.h.allocationPct - a.h.allocationPct)
        .slice(0, 6)
        .forEach(({ inv, h }) => out.push({ kind: "holds", label: inv.name, figure: `${h.allocationPct.toFixed(0)}% of portfolio`, go: go(`/investor/${inv.id}`) }));
      if (out.length === 0) out.push({ kind: "holds", label: `No tracked wallet holds ${target} yet`, go: () => closePalette() });
      return out;
    }
    if (/^go live$|^live( mode)?$/.test(q)) {
      out.push({ kind: "mode", label: connected ? "Switch to Live · real swaps on Solana" : "Connect a wallet to go live", go: () => { closePalette(); if (connected) setMode("live"); else openConnect(); } });
      return out;
    }
    if (/^practice( mode)?$|^go practice$/.test(q)) {
      out.push({ kind: "mode", label: "Switch to Practice · simulated fills", go: () => { closePalette(); setMode("practice"); } });
      return out;
    }
    const gap = q.match(/^(.+) gap$|^gaps$/);
    if (gap) {
      const name = gap[1]?.trim().toUpperCase();
      getPreIpoTokens()
        .filter((t) => !name || t.symbol.toUpperCase().includes(name))
        .sort((a, b) => Math.abs(b.premiumPct) - Math.abs(a.premiumPct))
        .slice(0, 6)
        .forEach((t) => out.push({ kind: "gap", label: `${t.symbol} · ${t.issuer}`, figure: `${t.premiumPct >= 0 ? "+" : ""}${t.premiumPct.toFixed(1)}% vs mark`, go: go("/pre-ipo") }));
      return out;
    }

    for (const t of getAllTickerInfos()) {
      if (t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)) {
        out.push({ kind: "ticker", label: `${t.symbol} · ${t.name}`, figure: isLivePriced(t.symbol) ? formatCurrency(getEffectivePrice(t.symbol)) : undefined, go: go(`/asset/${t.symbol}`) });
        if (out.length >= 6) break;
      }
    }
    for (const t of getPreIpoTokens()) {
      if (t.symbol.toLowerCase().includes(q)) out.push({ kind: "pre-ipo", label: `${t.symbol} · ${t.issuer}`, figure: formatCurrency(t.tokenPrice), go: go("/pre-ipo") });
    }
    for (const inv of investors) {
      if (inv.name.toLowerCase().includes(q) || inv.handle.toLowerCase().includes(q)) {
        out.push({ kind: "person", label: inv.name, figure: inv.handle, go: go(`/investor/${inv.id}`) });
        if (out.length >= 10) break;
      }
    }
    return out.slice(0, 10);
  }, [query, investors, connected, setMode, openConnect, router]);

  if (!isOpen) return null;

  return (
    <div className="palette scrim" onClick={closePalette} role="presentation">
      <div className="palette-box glass glass-era" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          placeholder="Search tickers, people, notes…"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, Math.max(0, results.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && results[cursor]) {
              results[cursor].go();
            }
          }}
        />
        <ul role="listbox">
          {results.length === 0 ? (
            <li className="text-muted" style={{ gridTemplateColumns: "1fr" }}>
              {query.trim() ? "Nothing matches yet." : HINT}
            </li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.kind}-${r.label}`} role="option" aria-selected={i === cursor} className={i === cursor ? "on" : ""} onMouseEnter={() => setCursor(i)} onClick={r.go}>
                <small className="eyebrow">{r.kind}</small>
                <span className="truncate">{r.label}</span>
                <span className="font-mono text-muted">{r.figure ?? ""}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
