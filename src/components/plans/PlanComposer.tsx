"use client";

import { useEffect, useRef, useState } from "react";
import { plansClient, type PlanPreview } from "@/lib/plans-client";
import type { PlanCondition, PlanMode } from "@/lib/plans";
import { PLAN_TEXT_MAX } from "@/lib/plans";

const DEBOUNCE_MS = 400;

/** "armed": the sentence is a plan now, clear the box. "dismissed": the wallet sheet closed without arming; keep the sentence for another go. */
export type ArmOutcome = "armed" | "dismissed";

interface Props {
  mode: PlanMode;
  /** Signed out: the box is disabled and the parent shows the sign-in copy. */
  disabled?: boolean;
  /** Example sentences built from live prices (three at most). */
  chips: string[];
  /** Creates and arms (or hands a Jupiter plan to the wallet sheet); the parent shows the toast. Throws to show an error under the box. */
  onArm: (text: string, condition: PlanCondition) => Promise<ArmOutcome>;
  initialText?: string;
}

interface PreviewState extends PlanPreview {
  /** The trimmed text this preview answers; a stale one is ignored. */
  text: string;
}

/**
 * The prompt box (agent-ux §2.1): the partner's `.plan-form` with the ›
 * glyph, a mono input and ARM IT inside. Typing debounces 400 ms into
 * `POST /api/plans/preview` — the pure parser, no model — and the line
 * under the box says what Solera read. ARM IT is enabled only when that
 * line is an understood rule; nothing is armed until it is tapped.
 */
export function PlanComposer({ mode, disabled = false, chips, onArm, initialText = "" }: Props) {
  const [text, setText] = useState(initialText);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const trimmed = text.trim();

  useEffect(() => {
    if (!trimmed) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const p = await plansClient.preview(trimmed);
        if (seq.current === mine) setPreview({ ...p, text: trimmed });
      } catch {
        if (seq.current === mine) setPreview({ condition: null, summary: null, question: "Solera couldn't read that just now. Try again in a moment.", partial: {}, text: trimmed });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const current = preview && preview.text === trimmed ? preview : null;
  const ready = !!current?.condition && !disabled && !busy;

  const arm = async () => {
    if (!current?.condition || !ready) return;
    setBusy(true);
    setError(null);
    setFlash(true);
    try {
      const outcome = await onArm(trimmed, current.condition);
      if (outcome === "armed") {
        setText("");
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't arm that plan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pl-composer">
      <form
        className="plan-form"
        onSubmit={(e) => {
          e.preventDefault();
          void arm();
        }}
      >
        <span className="pl-prompt" aria-hidden="true">
          ›
        </span>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="if TSLAx falls to $300, sell 5 shares"
          aria-label="Write a plan in plain words"
          maxLength={PLAN_TEXT_MAX}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled || busy}
        />
        <button
          type="submit"
          className={`btn btn-live ${flash ? "armed" : ""}`}
          disabled={!ready}
          aria-busy={busy || undefined}
          onAnimationEnd={() => setFlash(false)}
          title={disabled ? "Sign in to arm a plan" : current?.condition ? `Arm it in ${mode}` : "Write a rule Solera understands first"}
        >
          {busy ? "Arming…" : "Arm it"}
        </button>
      </form>
      <p className="pl-preview" aria-live="polite">
        {current ? (
          current.condition && current.summary ? (
            <>
              <span className="ok">Understood:</span> {current.summary}
              {mode === "live" ? " · live" : ""}
            </>
          ) : (
            <>
              <span className="no">Not yet:</span> {current.question ?? "Say which ticker, at what price, and how much."}
            </>
          )
        ) : trimmed && !disabled ? (
          <span className="dim">reading…</span>
        ) : null}
      </p>
      {error && (
        <p className="pl-error" role="alert">
          {error}
        </p>
      )}
      {!disabled && chips.length > 0 && (
        <div className="lens-chips" role="group" aria-label="Example plans">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className="lens-chip"
              onClick={() => {
                setText(c);
                setError(null);
                inputRef.current?.focus();
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
