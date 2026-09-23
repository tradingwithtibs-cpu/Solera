"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media";
import { MESSAGE_MAX } from "./helpers";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
  /** The three canonical prompts; the placeholder cycles through them every 6 s. */
  prompts: string[];
  /** The mock asked for a size: the placeholder says what to type. */
  sizePending: boolean;
}

const CYCLE_MS = 6_000;
const MAX_HEIGHT_PX = 96;

/**
 * The partner's prompt box (agent-ux §1.4, `.plan-form`): `›` glyph, a
 * textarea that grows to four lines, SEND on the live gradient. Enter
 * sends, Shift+Enter breaks a line. Disabled while a request is in flight.
 */
export function AgentComposer({ value, onChange, onSend, disabled, prompts, sizePending }: Props) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (reducedMotion || prompts.length < 2) return;
    const id = setInterval(() => setTick((t) => t + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [reducedMotion, prompts.length]);

  // Grow with the text, up to four lines; then the textarea scrolls.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const placeholder = sizePending ? "$250, or 2 shares" : prompts.length ? prompts[tick % prompts.length] : "Ask, or write a plan…";

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
  };

  return (
    <form
      className="plan-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="lens-prompt" aria-hidden="true">
        ›
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={MESSAGE_MAX}
        placeholder={placeholder}
        aria-label="Ask the agent, or write a plan in plain words"
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" className="btn-live" disabled={disabled || !value.trim()} aria-busy={disabled}>
        Send
      </button>
    </form>
  );
}
