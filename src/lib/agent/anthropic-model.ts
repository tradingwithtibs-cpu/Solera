import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../http-error";
import type { AgentModel, Msg, Turn } from "./types";

/**
 * Claude behind the same AgentModel seam as the mock. One non-streaming
 * request per loop iteration: replies are short (the tools carry the data)
 * and the loop is capped, so the whole turn fits the route's 60 s budget.
 * The system prompt is the cached prefix; everything volatile is in the
 * first user message's <state> block, so the cache holds across users.
 */
export const DEFAULT_MODEL_ID = "claude-opus-5";

export class AnthropicModel implements AgentModel {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    private readonly modelId: string = process.env.SOLERA_AGENT_MODEL_ID || DEFAULT_MODEL_ID,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ timeout: 40_000, maxRetries: 1 });
  }

  async complete(req: { system: string; tools: Anthropic.Beta.BetaTool[]; messages: Msg[] }): Promise<Turn> {
    const res = await this.client.beta.messages.create({
      model: this.modelId,
      max_tokens: 2048,
      // Policy declines re-run on a fallback model inside the same call, so a refusal is the last resort, not the first.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      tools: req.tools,
      messages: req.messages,
      // Chat-shaped work; adaptive thinking stays on by default and low effort keeps each hop quick.
      output_config: { effort: "low" },
    });
    return {
      content: res.content,
      stop_reason: res.stop_reason,
      usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, cache_read_input_tokens: res.usage.cache_read_input_tokens },
    };
  }
}

/** The SDK's typed errors → the statuses the Agent tab knows how to word. Null for anything else. */
export function mapAnthropicError(err: unknown): HttpError | null {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new HttpError(501, "Agent isn't configured on this deployment yet.");
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, "The agent is busy right now. Try again in a moment.");
  if (err instanceof Anthropic.APIError) return new HttpError(502, "The agent isn't available right now.");
  return null;
}
