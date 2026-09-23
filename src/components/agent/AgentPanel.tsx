"use client";

import "./agent.css";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Panel } from "@/components/panels/Panel";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { AgentMessage } from "./AgentMessage";
import { AgentComposer } from "./AgentComposer";
import { PromptChips } from "./PromptChips";
import { Toasts } from "./Toasts";
import { AGENT_FOOT, EMPTY_LINE, MESSAGE_MAX, starterChips, subtitleFor } from "./helpers";

/**
 * `/agent?q=` sends the question on load, once; `/agent?plan=` prefills the
 * composer and waits (never sends, never arms). The query is then dropped
 * from the URL with the native history API (which the router syncs with,
 * no refetch, no reload) so a reload does not repeat it. Reads search
 * params, so it sits under its own Suspense boundary.
 */
function EntryParams({ onQuery, onPlan }: { onQuery: (q: string) => void; onPlan: (p: string) => void }) {
  const params = useSearchParams();
  const q = params.get("q");
  const plan = params.get("plan");
  useEffect(() => {
    if (!q && !plan) return;
    if (q) onQuery(q);
    else if (plan) onPlan(plan);
    window.history.replaceState(null, "", "/agent");
  }, [q, plan, onQuery, onPlan]);
  return null;
}

/**
 * The Agent card (agent-ux §1.2): message list (scrolls) → composer (stays
 * at the foot) → starter chips. The subtitle names the model; the foot is
 * the disclosure. Every card under a reply needs the person's tap.
 */
export function AgentPanel({ id = "agent" }: { id?: string }) {
  const { turns, pendingDraft, inFlight, error, model, send, retry, clear, updateCard } = useAgentChat();
  const { mode } = useTradeMode();
  const tsla = useEffectivePrice("TSLAx");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const entryHandled = useRef(false);

  // Keep the newest turn in view; scroll the list only, never the page.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, inFlight, error]);

  const onQuery = useCallback(
    (q: string) => {
      if (entryHandled.current) return;
      entryHandled.current = true;
      send(q);
    },
    [send],
  );
  const onPlan = useCallback((p: string) => {
    if (entryHandled.current) return;
    entryHandled.current = true;
    setDraft(p.slice(0, MESSAGE_MAX));
  }, []);

  const chips = starterChips({ tslaPrice: tsla.isLive ? tsla.price : undefined, live: mode === "live" });

  return (
    <Panel
      id={id}
      title="Agent"
      subtitle={subtitleFor(model)}
      foot={<span className="agent-foot">{AGENT_FOOT}</span>}
      tools={
        turns.length > 0 ? (
          <button type="button" className="btn-ghost btn-small" onClick={clear} disabled={inFlight} title="Start a new conversation">
            clear
          </button>
        ) : undefined
      }
    >
      <Suspense fallback={null}>
        <EntryParams onQuery={onQuery} onPlan={onPlan} />
      </Suspense>
      <div className="agent">
        <div ref={listRef} className="agent-list" role="log" aria-label="Conversation with the agent">
          {turns.length === 0 && <p className="agent-empty">{EMPTY_LINE}</p>}
          {turns.map((t, i) => (
            <AgentMessage
              key={t.id}
              turn={t}
              isLast={i === turns.length - 1}
              inFlight={inFlight}
              error={i === turns.length - 1 ? error : null}
              onRetry={retry}
              onCard={(index, patch) => updateCard(t.id, index, patch)}
            />
          ))}
        </div>
        <AgentComposer
          value={draft}
          onChange={setDraft}
          onSend={(text) => {
            send(text);
            setDraft("");
          }}
          disabled={inFlight}
          prompts={chips.primary}
          sizePending={!!pendingDraft}
        />
        <PromptChips primary={chips.primary} secondary={chips.secondary} disabled={inFlight} onPick={send} />
      </div>
      <Toasts />
    </Panel>
  );
}
