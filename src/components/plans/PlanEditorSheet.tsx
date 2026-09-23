"use client";

import "./plans.css";
import { useId, useMemo, useState } from "react";
import { Sheet, SheetHead } from "@/components/auth/Sheet";
import { openAuthSheet } from "@/components/auth/auth-sheet-store";
import { useCatalog } from "@/hooks/use-catalog";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { useSession } from "@/hooks/use-session";
import { getAllTickerInfos } from "@/lib/catalog";
import { getEffectivePrice, isLivePriced } from "@/lib/live-prices";
import { DEFAULT_ARM_DAYS, MAX_ARM_DAYS, describe, validateCondition, type Plan, type PlanCondition, type PlanMode } from "@/lib/plans";
import { plansClient } from "@/lib/plans-client";
import { refreshPlans } from "@/hooks/use-plans";
import { money } from "./plan-format";
import { useClock } from "./use-clock";

const DAY_MS = 24 * 60 * 60_000;
/** Jupiter's recommended maximum for a live order; practice may run longer. */
const LIVE_MAX_DAYS = 30;
const FRACTIONS: Array<{ label: string; value: number }> = [
  { label: "all", value: 1 },
  { label: "½", value: 0.5 },
  { label: "⅓", value: 1 / 3 },
  { label: "¼", value: 0.25 },
];

interface Props {
  mode: PlanMode;
  /** Prefilled from a card's or a row's condition. */
  initial?: Partial<PlanCondition> | null;
  /** The person's own sentence, kept on the new proposal when given. */
  text?: string;
  /** A proposed draft to discard once the fresh proposal exists (backend §6.3 has no PATCH for the condition). */
  replaceId?: string | null;
  source?: "ui" | "agent";
  onSaved?: (plan: Plan) => void;
  onClose: () => void;
}

function num(s: string): number | undefined {
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? undefined : n;
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nearestFraction(f: number): number {
  return FRACTIONS.reduce((best, cur) => (Math.abs(cur.value - f) < Math.abs(best - f) ? cur.value : best), FRACTIONS[0].value);
}

/**
 * The plan editor (agent-ux §2.4): every field maps to one part of a
 * PlanCondition, validated inline with the same `validateCondition` the
 * server runs, restated live with `describe()`. SAVE posts a fresh
 * proposal and discards the old draft; nothing is armed here. Used by
 * the Agent tab's EDIT as well, so it is exported on its own.
 */
export function PlanEditorSheet({ mode, initial, text, replaceId, source = "ui", onSaved, onClose }: Props) {
  const titleId = useId();
  const { token } = useSession();
  const { tokens: catalog } = useCatalog();
  const clock = useClock();

  const init = initial ?? {};
  const initTrigger = init.trigger && init.trigger.kind === "price" ? init.trigger : null;
  const initAction = init.action;
  const [tickerQuery, setTickerQuery] = useState(init.ticker ?? "");
  const [ticker, setTicker] = useState<string | null>(init.ticker ?? null);
  const [op, setOp] = useState<"gte" | "lte">(initTrigger?.op ?? "gte");
  const [price, setPrice] = useState(initTrigger ? String(initTrigger.price) : "");
  const [side, setSide] = useState<"buy" | "sell">(initAction?.side ?? "buy");
  const [buyBy, setBuyBy] = useState<"usd" | "shares">(initAction && initAction.side === "buy" && "shares" in initAction ? "shares" : "usd");
  const [amount, setAmount] = useState(initAction && "amountUsd" in initAction ? String(initAction.amountUsd) : "");
  const [buyShares, setBuyShares] = useState(initAction && initAction.side === "buy" && "shares" in initAction ? String(initAction.shares) : "");
  const [sellBy, setSellBy] = useState<"shares" | "fraction">(initAction && initAction.side === "sell" && "fraction" in initAction ? "fraction" : "shares");
  const [sellShares, setSellShares] = useState(initAction && initAction.side === "sell" && "shares" in initAction ? String(initAction.shares) : "");
  const [fraction, setFraction] = useState<number>(initAction && "fraction" in initAction ? nearestFraction(initAction.fraction) : 1);
  const [target, setTarget] = useState(init.exits?.find((e) => e.kind === "target")?.price.toString() ?? "");
  const [stop, setStop] = useState(init.exits?.find((e) => e.kind === "stop")?.price.toString() ?? "");
  const [wrongIf, setWrongIf] = useState(init.wrongIf ?? "");
  const [note, setNote] = useState(init.note ?? "");
  const [until, setUntil] = useState("");
  const [payWith, setPayWith] = useState<"SOL" | "USDC">(init.payWith ?? "SOL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxDays = mode === "live" ? LIVE_MAX_DAYS : MAX_ARM_DAYS;
  const defaultDays = Math.min(init.armDays ?? DEFAULT_ARM_DAYS, maxDays);
  const untilValue = until || (clock ? isoDate(clock + defaultDays * DAY_MS) : "");
  const minDate = clock ? isoDate(clock + DAY_MS) : undefined;
  const maxDate = clock ? isoDate(clock + maxDays * DAY_MS) : undefined;
  const armDays = clock && untilValue ? Math.max(1, Math.min(maxDays, Math.ceil((Date.parse(untilValue) - clock) / DAY_MS))) : defaultDays;

  const { price: selectedPrice, isLive: selectedLive } = useEffectivePrice(ticker ?? "");

  // Catalog search: symbol or name, the eight featured tickers first.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ symbol: string; name: string; usdPrice?: number }> = [];
    for (const t of getAllTickerInfos()) {
      if (!seen.has(t.symbol)) {
        seen.add(t.symbol);
        rows.push({ symbol: t.symbol, name: t.name });
      }
    }
    for (const t of catalog) {
      if (!seen.has(t.symbol)) {
        seen.add(t.symbol);
        rows.push({ symbol: t.symbol, name: t.name, usdPrice: t.usdPrice });
      }
    }
    return rows;
  }, [catalog]);
  const q = tickerQuery.trim().toLowerCase();
  const matches = q && q !== (ticker ?? "").toLowerCase() ? options.filter((o) => o.symbol.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)).slice(0, 6) : [];

  const condition: PlanCondition | null = ticker
    ? {
        ticker,
        trigger: { kind: "price", op, price: num(price) ?? NaN },
        action:
          side === "buy"
            ? buyBy === "usd"
              ? { side: "buy", amountUsd: num(amount) ?? NaN }
              : { side: "buy", shares: num(buyShares) ?? NaN }
            : sellBy === "shares"
              ? { side: "sell", shares: num(sellShares) ?? NaN }
              : { side: "sell", fraction },
        exits:
          side === "buy"
            ? [
                ...(num(target) !== undefined ? [{ kind: "target" as const, price: num(target)! }] : []),
                ...(num(stop) !== undefined ? [{ kind: "stop" as const, price: num(stop)! }] : []),
              ]
            : [],
        ...(wrongIf.trim() ? { wrongIf: wrongIf.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(mode === "live" && side === "buy" ? { payWith } : {}),
        armDays,
      }
    : null;
  const problem = condition ? validateCondition(condition, { standing: true }) : "Which ticker?";
  const summary = condition && !problem ? describe(condition) : null;
  const underMinimum = mode === "live" && condition && !problem && condition.action.side === "buy" && "amountUsd" in condition.action && condition.action.amountUsd < 10;

  const save = async () => {
    if (!token) {
      openAuthSheet("signup");
      return;
    }
    if (!condition || problem) return;
    setBusy(true);
    setError(null);
    try {
      const sentence = text?.trim() || describe(condition);
      const plan = await plansClient.create(token, { text: sentence, condition, mode, source });
      if (replaceId) await plansClient.discard(token, replaceId).catch(() => undefined);
      await refreshPlans();
      onSaved?.(plan);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that plan.");
    } finally {
      setBusy(false);
    }
  };

  const pickedLine = ticker
    ? `${ticker} · ${options.find((o) => o.symbol === ticker)?.name ?? ""} · ${selectedLive && selectedPrice > 0 ? money(selectedPrice) : "no live price right now"}`
    : null;

  return (
    <Sheet labelledBy={titleId} onClose={onClose} locked={busy}>
      <SheetHead eyebrow="Plan" title="Edit the rule" id={titleId} onClose={busy ? undefined : onClose} />
      <form
        className="pl-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="contents">
          <div className="pl-ed-token">
            <label className="field-label">
              <span>Token</span>
              <span className="field">
                <input
                  type="text"
                  value={tickerQuery}
                  onChange={(e) => {
                    setTickerQuery(e.target.value);
                    const exact = options.find((o) => o.symbol.toLowerCase() === e.target.value.trim().toLowerCase());
                    setTicker(exact ? exact.symbol : null);
                  }}
                  placeholder="TSLAx"
                  autoComplete="off"
                  spellCheck={false}
                  data-autofocus={initial?.ticker ? undefined : ""}
                />
              </span>
            </label>
            {matches.length > 0 && (
              <ul className="pl-tk-list" aria-label="Matching tokens">
                {matches.map((o) => {
                  const live = isLivePriced(o.symbol);
                  const p = live ? getEffectivePrice(o.symbol) : o.usdPrice;
                  return (
                    <li key={o.symbol}>
                      <button
                        type="button"
                        onClick={() => {
                          setTicker(o.symbol);
                          setTickerQuery(o.symbol);
                        }}
                      >
                        <b>{o.symbol}</b>
                        <small>{o.name}</small>
                        <span>{p && p > 0 ? money(p) : "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {q && matches.length === 0 && !ticker && <span className="pl-tk-pick">No matching assets.</span>}
            {pickedLine && <span className="pl-tk-pick">{pickedLine}</span>}
          </div>

          <div className="pl-ed-row">
            <label className="field-label">
              <span>When the price is</span>
              <span className="seg" role="group" aria-label="Direction">
                <button type="button" aria-pressed={op === "gte"} onClick={() => setOp("gte")}>
                  at or above
                </button>
                <button type="button" aria-pressed={op === "lte"} onClick={() => setOp("lte")}>
                  at or below
                </button>
              </span>
            </label>
            <label className="field-label">
              <span>Price</span>
              <span className="field">
                <span className="pl-money">$</span>
                <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="300" aria-label="Trigger price in dollars" />
              </span>
            </label>
          </div>

          <div className="pl-ed-row">
            <label className="field-label">
              <span>Do</span>
              <span className="seg" role="group" aria-label="Side">
                <button type="button" aria-pressed={side === "buy"} onClick={() => setSide("buy")}>
                  buy
                </button>
                <button type="button" aria-pressed={side === "sell"} onClick={() => setSide("sell")}>
                  sell
                </button>
              </span>
            </label>
            {side === "buy" ? (
              <label className="field-label">
                <span>
                  <span className="seg" role="group" aria-label="Buy by">
                    <button type="button" aria-pressed={buyBy === "usd"} onClick={() => setBuyBy("usd")}>
                      $ amount
                    </button>
                    <button type="button" aria-pressed={buyBy === "shares"} onClick={() => setBuyBy("shares")}>
                      shares
                    </button>
                  </span>
                </span>
                <span className="field">
                  {buyBy === "usd" ? (
                    <>
                      <span className="pl-money">$</span>
                      <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250" aria-label="Dollar amount to buy" />
                    </>
                  ) : (
                    <input type="text" inputMode="decimal" value={buyShares} onChange={(e) => setBuyShares(e.target.value)} placeholder="2" aria-label="Shares to buy" />
                  )}
                </span>
              </label>
            ) : (
              <label className="field-label">
                <span>
                  <span className="seg" role="group" aria-label="Sell by">
                    <button type="button" aria-pressed={sellBy === "shares"} onClick={() => setSellBy("shares")}>
                      shares
                    </button>
                    <button type="button" aria-pressed={sellBy === "fraction"} onClick={() => setSellBy("fraction")}>
                      fraction
                    </button>
                  </span>
                </span>
                {sellBy === "shares" ? (
                  <span className="field">
                    <input type="text" inputMode="decimal" value={sellShares} onChange={(e) => setSellShares(e.target.value)} placeholder="5" aria-label="Shares to sell" />
                  </span>
                ) : (
                  <span className="seg" role="group" aria-label="Fraction of the position">
                    {FRACTIONS.map((f) => (
                      <button key={f.label} type="button" aria-pressed={fraction === f.value} onClick={() => setFraction(f.value)}>
                        {f.label}
                      </button>
                    ))}
                  </span>
                )}
              </label>
            )}
          </div>

          {side === "buy" && (
            <div className="pl-ed-row">
              <label className="field-label">
                <span>
                  Then hold until target <em>optional</em>
                </span>
                <span className="field">
                  <span className="pl-money">$</span>
                  <input type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="420" aria-label="Target price" />
                </span>
              </label>
              <label className="field-label">
                <span>
                  or stop <em>optional</em>
                </span>
                <span className="field">
                  <span className="pl-money">$</span>
                  <input type="text" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="280" aria-label="Stop price" />
                </span>
              </label>
            </div>
          )}

          <label className="field-label">
            <span>
              Wrong if <em>optional · shown on the position, never evaluated</em>
            </span>
            <span className="field">
              <input type="text" maxLength={160} value={wrongIf} onChange={(e) => setWrongIf(e.target.value)} placeholder="deliveries fall two quarters in a row" />
            </span>
          </label>
          <label className="field-label">
            <span>
              Why? <em>optional · carried onto the fill</em>
            </span>
            <span className="field">
              <textarea rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One sentence you'd want to read back in six months…" />
            </span>
          </label>

          <div className="pl-ed-row">
            <label className="field-label">
              <span>
                Watch until <em>{armDays} day{armDays === 1 ? "" : "s"}</em>
              </span>
              <span className="field">
                <input type="date" value={untilValue} min={minDate} max={maxDate} onChange={(e) => setUntil(e.target.value)} aria-label="Watch until" />
              </span>
            </label>
            {mode === "live" && side === "buy" && (
              <label className="field-label">
                <span>Pay with</span>
                <span className="seg" role="group" aria-label="Pay with">
                  {(["SOL", "USDC"] as const).map((c) => (
                    <button key={c} type="button" aria-pressed={payWith === c} onClick={() => setPayWith(c)}>
                      {c}
                    </button>
                  ))}
                </span>
              </label>
            )}
          </div>

          <p className="pl-ed-understood" aria-live="polite">
            {summary ? (
              <>
                <span className="ok">Understood:</span> {summary}
                {mode === "live" ? " · live" : " · practice"}
              </>
            ) : (
              <>
                <span className="no">Not yet:</span> {problem}
              </>
            )}
            {underMinimum && <> · Jupiter can&apos;t hold an order under $10; Solera will notify you instead.</>}
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <div className="sheet-actions">
          <button type="submit" className="btn-primary" disabled={busy || (!!token && (!condition || !!problem))} aria-busy={busy || undefined}>
            {busy ? "Saving…" : token ? "Save" : "Sign in to save"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
