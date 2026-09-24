import type Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "../news";
import type { Plan, PlanCondition, PlanExecution, PlanMode, PlanStatus } from "../plans";
import type { CompanyId } from "../pre-ipo";
import type { CatalogToken } from "../catalog";
import type { NewsResponse } from "../news-server";
import type { TickerSymbol, TradeSide } from "../types";

/**
 * The agent's wire shapes (docs/port/backend.md §7.1) and the seams the
 * run loop is built on: a model that completes a turn, tools that run
 * against injected dependencies. Both the mock and Claude produce the same
 * AgentResponse, so the UI never knows which one answered.
 */
export type AgentModelName = "anthropic" | "mock";

export interface AgentTurnMessage {
  role: "user" | "assistant";
  content: string;
}

/** The unfinished plan the mock asked a question about; the client echoes it back verbatim. */
export interface PendingDraft {
  text: string;
  condition: Partial<PlanCondition> & { side?: TradeSide };
}

export interface AgentRequest {
  messages: AgentTurnMessage[];
  mode: PlanMode;
  context?: {
    ticker?: TickerSymbol;
    page?: string;
    /** plan_preview = one turn restricted to create_plan or text (the Plans composer). */
    intent?: "chat" | "plan_preview";
    pendingDraft?: PendingDraft | null;
  };
}

export type AgentCard =
  | {
      kind: "plan";
      /** null when the person is signed out: the card offers SIGN IN TO ARM and re-posts the condition once they are. */
      planId: string | null;
      summary: string;
      mode: PlanMode;
      execution: PlanExecution;
      status: "proposed";
      condition: PlanCondition;
      text: string;
    }
  | { kind: "ticket"; ticker: TickerSymbol; side: TradeSide; amountUsd?: number; shares?: number; note?: string; mode: PlanMode }
  | { kind: "news"; ticker?: TickerSymbol; company?: CompanyId; items: NewsItem[]; source: NewsResponse["source"] }
  | { kind: "prices"; prices: Record<TickerSymbol, number>; fetchedAt: number }
  | { kind: "plans"; plans: Array<{ id: string; summary: string; status: PlanStatus; mode: PlanMode; createdAt: number }> }
  | { kind: "explain"; planId: string; text: string };

export interface AgentResponse {
  model: AgentModelName;
  /** The assistant bubble: plain text, short. */
  reply: string;
  /** Rendered under the bubble, in order; built from tool results, never from prose. */
  cards: AgentCard[];
  toolTrace: Array<{ name: string; ok: boolean; ms: number }>;
  usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
  pendingDraft?: PendingDraft | null;
}

/** What the first user message carries in its <state> block. */
export interface AgentState {
  mode: PlanMode;
  signedIn: boolean;
  /** Short form only (first 4 · last 4); the full key never reaches the model. */
  wallet: string | null;
  ticker?: TickerSymbol;
  page?: string;
  intent: "chat" | "plan_preview";
  openPlans: Array<{ n: number; id: string; summary: string; status: PlanStatus; mode: PlanMode }>;
  pendingDraft: PendingDraft | null;
  now: string;
}

export type Msg = Anthropic.Beta.BetaMessageParam;

export interface Turn {
  content: Anthropic.Beta.BetaContentBlock[];
  stop_reason: Anthropic.Beta.BetaStopReason | null;
  usage?: Pick<Anthropic.Beta.BetaUsage, "input_tokens" | "output_tokens"> & { cache_read_input_tokens?: number | null };
  /** Only the mock sets this: the draft it wants echoed back next turn. */
  pendingDraft?: PendingDraft | null;
}

export interface AgentModel {
  readonly name: AgentModelName;
  complete(req: { system: string; tools: Anthropic.Beta.BetaTool[]; messages: Msg[] }): Promise<Turn>;
}

export interface ToolContext {
  owner: string | null;
  wallet: string | null;
  mode: PlanMode;
  ticker?: TickerSymbol;
  page?: string;
  intent: "chat" | "plan_preview";
  openPlans: AgentState["openPlans"];
}

/** Everything a tool touches outside itself, so tests run the loop against fakes. */
export interface ToolDeps {
  prices: (tickers: string[]) => Promise<{
    prices: Record<string, number>;
    fetchedAt: number;
    /** The listed share's Pyth reference, for the featured tickers that have one. */
    underlying?: Record<string, { price: number; publishTime: number; stale: boolean }>;
  }>;
  news: (q: { ticker?: string; company?: CompanyId }) => Promise<NewsResponse>;
  catalog: () => Promise<CatalogToken[]>;
  isTradable: (ticker: string) => Promise<boolean>;
  createPlan: (input: { owner: string; wallet: string | null; mode: PlanMode; text: string; condition: PlanCondition; source: "agent" }) => Promise<Plan>;
  listPlans: (owner: string) => Promise<Plan[]>;
  getPlan: (id: string, owner: string) => Promise<Plan | null>;
  cancelPlan: (plan: Plan) => Promise<Plan>;
}

export interface ToolOutcome {
  /** JSON for the model. */
  content: string;
  isError?: boolean;
  card?: AgentCard;
}
