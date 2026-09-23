import { AnthropicModel } from "./anthropic-model";
import { MockModel, type MockOptions } from "./mock-model";
import type { AgentModel, AgentModelName } from "./types";

/**
 * Which model answers: SOLERA_AGENT_MODEL=mock|anthropic wins; otherwise
 * Claude when ANTHROPIC_API_KEY is set, the offline parser when it is not.
 */
export function selectModelName(env: NodeJS.ProcessEnv = process.env): AgentModelName {
  const forced = env.SOLERA_AGENT_MODEL?.toLowerCase();
  if (forced === "mock") return "mock";
  if (forced === "anthropic") return "anthropic";
  return env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
}

export function selectModel(opts: MockOptions, env: NodeJS.ProcessEnv = process.env): AgentModel {
  return selectModelName(env) === "anthropic" ? new AnthropicModel(env.SOLERA_AGENT_MODEL_ID || undefined) : new MockModel(opts);
}
