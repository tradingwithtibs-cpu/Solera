"use client";

import { useId, useState } from "react";
import { Sheet, SheetHead } from "@/components/auth/Sheet";
import { DEFAULT_ARM_DAYS, describe, MAX_ARM_DAYS, validateCondition, type PlanCondition, type PlanExit, type PlanMode } from "@/lib/plans";

interface Props {
  condition: PlanCondition;
  mode: PlanMode;
  /** Posts a fresh proposal (or, signed out, keeps it on the card). Throws to show a problem. */
  onSave: (next: PlanCondition) => Promise<void> | void;
  onClose: () => void;
}

const FRACTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "all" },
  { value: 0.5, label: "½" },
  { value: 1 / 3, label: "⅓" },
  { value: 0.25, label: "¼" },
];
const LIVE_MAX_DAYS = 30;

function num(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A minimal plan editor on the sheet frame (agent-ux §2.4 fields, 1:1 with
 * PlanCondition), used by the plan card's EDIT until the Plans UI's own
 * PlanEditorSheet lands. Saving posts a fresh proposal; nothing is armed.
 */
export function PlanEditorSheet({ condition, mode, onSave, onClose }: Props) {
  const titleId = useId();
  const a = condition.action;
  const t = condition.trigger;
  const [ticker, setTicker] = useState(condition.ticker);
  const [op, setOp] = useState<"gte" | "lte">(t.kind === "price" ? t.op : "gte");
  const [price, setPrice] = useState(t.kind === "price" ? String(t.price) : "");
  const [side, setSide] = useState<"buy" | "sell">(a.side);
  const [buyBy, setBuyBy] = useState<"amount" | "shares">(a.side === "buy" && "shares" in a ? "shares" : "amount");
  const [sellBy, setSellBy] = useState<"shares" | "fraction">(a.side === "sell" && "fraction" in a ? "fraction" : "shares");
  const [amount, setAmount] = useState(a.side === "buy" && "amountUsd" in a ? String(a.amountUsd) : "");
  const [shares, setShares] = useState("shares" in a ? String(a.shares) : "");
  const [fraction, setFraction] = useState<number>(a.side === "sell" && "fraction" in a ? a.fraction : 1);
  const [target, setTarget] = useState(String(condition.exits.find((e) => e.kind === "target")?.price ?? ""));
  const [stop, setStop] = useState(String(condition.exits.find((e) => e.kind === "stop")?.price ?? ""));
  const [wrongIf, setWrongIf] = useState(condition.wrongIf ?? "");
  const [note, setNote] = useState(condition.note ?? "");
  const [days, setDays] = useState(String(condition.armDays ?? DEFAULT_ARM_DAYS));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const build = (): PlanCondition => {
    const base = ticker.trim().replace(/x$/i, "").toUpperCase();
    const action: PlanCondition["action"] =
      side === "buy"
        ? buyBy === "amount"
          ? { side: "buy", amountUsd: num(amount) ?? Number.NaN }
          : { side: "buy", shares: num(shares) ?? Number.NaN }
        : sellBy === "shares"
          ? { side: "sell", shares: num(shares) ?? Number.NaN }
          : { side: "sell", fraction };
    const exits: PlanExit[] = [];
    if (side === "buy") {
      const tp = num(target);
      const sl = num(stop);
      if (tp !== undefined) exits.push({ kind: "target", price: tp });
      if (sl !== undefined) exits.push({ kind: "stop", price: sl });
    }
    const c: PlanCondition = { ticker: base ? `${base}x` : "", trigger: { kind: "price", op, price: num(price) ?? Number.NaN }, action, exits };
    if (wrongIf.trim()) c.wrongIf = wrongIf.trim().slice(0, 160);
    if (note.trim()) c.note = note.trim().slice(0, 280);
    const d = num(days);
    if (d !== undefined && Math.round(d) !== DEFAULT_ARM_DAYS) c.armDays = Math.round(d);
    if (condition.leg) c.leg = condition.leg;
    if (condition.payWith) c.payWith = condition.payWith;
    return c;
  };

  const next = build();
  const sizeMissing = side === "buy" ? (buyBy === "amount" ? num(amount) === undefined : num(shares) === undefined) : sellBy === "shares" && num(shares) === undefined;
  const d = num(days);
  const invalid = sizeMissing
    ? side === "buy"
      ? "How much: a dollar amount or a number of shares?"
      : "How many shares?"
    : (validateCondition(next, { standing: true }) ?? (mode === "live" && d !== undefined && d > LIVE_MAX_DAYS ? `A live plan stays armed for up to ${LIVE_MAX_DAYS} days.` : null));

  const save = async () => {
    if (invalid || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await onSave(next);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} locked={saving}>
      <SheetHead eyebrow="Plan" title="Edit the rule" id={titleId} onClose={onClose} />
      <form
        className="agent-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field-label">
          <span>Token</span>
          <div className="field">
            <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="TSLAx" autoCapitalize="characters" spellCheck={false} maxLength={13} data-autofocus />
          </div>
        </label>
        <div className="field-label">
          <span>When the price is</span>
          <div className="agent-editor-grid">
            <div className="seg" role="group" aria-label="Direction">
              <button type="button" aria-pressed={op === "gte"} onClick={() => setOp("gte")}>
                at or above
              </button>
              <button type="button" aria-pressed={op === "lte"} onClick={() => setOp("lte")}>
                at or below
              </button>
            </div>
            <div className="field">
              <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ price" aria-label="Trigger price" />
            </div>
          </div>
        </div>
        <div className="field-label">
          <span>Do</span>
          <div className="agent-editor-grid">
            <div className="seg" role="group" aria-label="Side">
              <button type="button" aria-pressed={side === "buy"} onClick={() => setSide("buy")}>
                buy
              </button>
              <button type="button" aria-pressed={side === "sell"} onClick={() => setSide("sell")}>
                sell
              </button>
            </div>
            {side === "buy" ? (
              <div className="seg" role="group" aria-label="Size by">
                <button type="button" aria-pressed={buyBy === "amount"} onClick={() => setBuyBy("amount")}>
                  $ amount
                </button>
                <button type="button" aria-pressed={buyBy === "shares"} onClick={() => setBuyBy("shares")}>
                  shares
                </button>
              </div>
            ) : (
              <div className="seg" role="group" aria-label="Size by">
                <button type="button" aria-pressed={sellBy === "shares"} onClick={() => setSellBy("shares")}>
                  shares
                </button>
                <button type="button" aria-pressed={sellBy === "fraction"} onClick={() => setSellBy("fraction")}>
                  fraction
                </button>
              </div>
            )}
            {side === "buy" && buyBy === "amount" ? (
              <div className="field">
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ amount" aria-label="Dollar amount" />
              </div>
            ) : side === "sell" && sellBy === "fraction" ? (
              <div className="seg" role="group" aria-label="Fraction">
                {FRACTIONS.map((f) => (
                  <button key={f.label} type="button" aria-pressed={Math.abs(fraction - f.value) < 1e-9} onClick={() => setFraction(f.value)}>
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="field">
                <input type="text" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="shares" aria-label="Shares" />
              </div>
            )}
          </div>
        </div>
        {side === "buy" && (
          <div className="field-label">
            <span>
              Then hold until <em>optional</em>
            </span>
            <div className="agent-editor-grid">
              <div className="field">
                <input type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="target $" aria-label="Target price" />
              </div>
              <div className="field">
                <input type="text" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="stop $" aria-label="Stop price" />
              </div>
            </div>
          </div>
        )}
        <div className="agent-editor-grid">
          <label className="field-label">
            <span>
              Wrong if <em>optional · 160</em>
            </span>
            <div className="field">
              <input type="text" value={wrongIf} onChange={(e) => setWrongIf(e.target.value)} maxLength={160} placeholder="deliveries fall two quarters in a row" />
            </div>
          </label>
          <label className="field-label">
            <span>Watch until · days</span>
            <div className="field">
              <input type="text" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder={String(DEFAULT_ARM_DAYS)} aria-describedby={`${titleId}-days`} />
            </div>
            <span id={`${titleId}-days`} className="agent-preview">
              up to {mode === "live" ? LIVE_MAX_DAYS : MAX_ARM_DAYS}
            </span>
          </label>
        </div>
        <label className="field-label">
          <span>
            Why? <em>optional · carried onto the fill</em>
          </span>
          <div className="field">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={2} placeholder="the thesis, in a sentence" />
          </div>
        </label>
        <p className="agent-preview" aria-live="polite">
          {invalid ? (
            <>
              <span className="no">Not yet:</span> {invalid}
            </>
          ) : (
            <>
              <span className="ok">Understood:</span> {describe(next)}
            </>
          )}
        </p>
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
        <div className="sheet-actions">
          <button type="submit" className="btn-primary" disabled={!!invalid || saving} aria-busy={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
        <p className="sheet-foot">Saving proposes the edited rule; it is armed only when you tap Arm it.</p>
      </form>
    </Sheet>
  );
}
