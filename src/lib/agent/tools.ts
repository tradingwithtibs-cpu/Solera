import type Anthropic from "@anthropic-ai/sdk";
import type { JsonSchema } from "./schema";

/**
 * The agent's tools (docs/port/backend.md §7.4): strict JSON schemas over
 * the same library functions the routes use. Stable order and byte-stable
 * text so the request prefix caches. Optional fields are nullable and still
 * listed in `required`, which is what strict mode wants.
 */
const COMPANY_IDS = ["openai", "anthropic", "spacex", "kalshi", "anduril", "neuralink", "polymarket", "figureai"] as const;

const nullable = (type: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: [type, "null"], ...extra });

export const CONDITION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  description: "A standing plan: watch one xStock's USD price and act once when it is at or above (gte) / at or below (lte) the trigger.",
  properties: {
    ticker: { type: "string", minLength: 2, maxLength: 13, description: "xStock symbol ending in a lowercase x, e.g. AAPLx, TSLAx." },
    trigger: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["price"] },
        op: { type: "string", enum: ["gte", "lte"], description: "gte = at or above the price, lte = at or below. Never guess the direction; ask." },
        price: { type: "number", exclusiveMinimum: 0, description: "USD per share." },
      },
      required: ["kind", "op", "price"],
    },
    action: {
      type: "object",
      additionalProperties: false,
      description: "Exactly one size: amountUsd (buys), shares (buys or sells) or fraction of the position 0-1 (sells).",
      properties: {
        side: { type: "string", enum: ["buy", "sell"] },
        amountUsd: nullable("number", { minimum: 1 }),
        shares: nullable("number", { exclusiveMinimum: 0 }),
        fraction: nullable("number", { exclusiveMinimum: 0, maximum: 1 }),
      },
      required: ["side", "amountUsd", "shares", "fraction"],
    },
    exits: {
      type: "array",
      maxItems: 2,
      description: "Buys only: at most one target and one stop, checked after the buy fills.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { kind: { type: "string", enum: ["target", "stop"] }, price: { type: "number", exclusiveMinimum: 0 } },
        required: ["kind", "price"],
      },
    },
    wrongIf: nullable("string", { maxLength: 160, description: "The person's own 'I'm wrong if…' sentence, if they gave one. Never evaluated." }),
    note: nullable("string", { maxLength: 280, description: "The person's reasoning, if they gave one ('because…')." }),
    armDays: nullable("number", { minimum: 1, maximum: 90, description: "How many days the plan stays armed; default 30." }),
  },
  required: ["ticker", "trigger", "action", "exits", "wrongIf", "note", "armDays"],
};

/**
 * Strict tools accept a subset of JSON Schema: no length or range keywords
 * (the API answers 400 "property 'maxItems' is not supported"). The full
 * schema stays here for the hand validator; the API gets a copy without them.
 */
const API_UNSUPPORTED = new Set(["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "format"]);

function forApi(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(forApi);
  if (schema && typeof schema === "object") {
    const src = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) if (!API_UNSUPPORTED.has(k)) out[k] = forApi(v);
    // A nullable enum: the API refuses `type: ["string", "null"]` alongside `enum` ("Enum value … does not match declared
    // type"), so it becomes anyOf: the enum on its base type, or null.
    if (Array.isArray(src.enum) && Array.isArray(src.type) && src.type.includes("null")) {
      const base = (src.type as string[]).filter((t) => t !== "null");
      const { enum: values, type: _type, ...rest } = out;
      void _type;
      return { ...rest, anyOf: [{ type: base.length === 1 ? base[0] : base, enum: (values as unknown[]).filter((v) => v !== null) }, { type: "null" }] };
    }
    return out;
  }
  return schema;
}

const FULL_SCHEMAS = new Map<string, JsonSchema>();

const strictTool = (name: string, description: string, input_schema: JsonSchema): Anthropic.Beta.BetaTool => {
  FULL_SCHEMAS.set(name, input_schema);
  return { name, description, strict: true, input_schema: forApi(input_schema) as Anthropic.Beta.BetaTool.InputSchema };
};

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  strictTool("get_prices", "Live USD prices for one or more xStocks from Jupiter, plus, for the featured tickers, the listed share's reference price from Pyth and the token's gap to it in percent. Use before quoting any price, and use the reference when asked how a token compares to the real stock.", {
    type: "object",
    additionalProperties: false,
    properties: { tickers: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 13 }, description: "Symbols like AAPLx." } },
    required: ["tickers"],
  }),
  strictTool("get_news", "Recent headlines for one xStock's company (ticker) or one pre-IPO token company (company; some have listed since, and the error names the listed share). Pass exactly one; the other is null. Quote headlines verbatim with their source.", {
    type: "object",
    additionalProperties: false,
    properties: {
      ticker: nullable("string", { minLength: 2, maxLength: 13, description: "e.g. TSLAx" }),
      company: { type: ["string", "null"], enum: [...COMPANY_IDS, null], description: "A pre-IPO company id." },
    },
    required: ["ticker", "company"],
  }),
  strictTool("get_catalog", "Search the tokenized-stock catalog by symbol or company name when you are not sure a ticker exists or how it is spelled.", {
    type: "object",
    additionalProperties: false,
    properties: { query: { type: "string", minLength: 1, maxLength: 40 } },
    required: ["query"],
  }),
  strictTool("create_plan", "Propose a standing plan from the person's words. Nothing is armed: the app shows a card they confirm. Requires an explicit size; if none was given, ask instead of calling this.", {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string", minLength: 1, maxLength: 280, description: "The person's sentence, as they said it." },
      condition: CONDITION_SCHEMA,
      mode: { type: "string", enum: ["practice", "live"], description: "The app's current mode from <state>." },
    },
    required: ["text", "condition", "mode"],
  }),
  strictTool("list_plans", "The person's plans. active = proposed, armed, holding or ready; past = done, failed, expired or cancelled; null = active.", {
    type: "object",
    additionalProperties: false,
    properties: { status: { type: ["string", "null"], enum: ["active", "past", null] } },
    required: ["status"],
  }),
  strictTool("cancel_plan", "Cancel one of the person's plans by id (from <state> or list_plans). Jupiter orders need the person's signature, which the app handles.", {
    type: "object",
    additionalProperties: false,
    properties: { planId: { type: "string", minLength: 8, maxLength: 64 } },
    required: ["planId"],
  }),
  strictTool("place_practice_order", "Propose an immediate order at the live price. Nothing is filled: the app opens the ticket for the person to review. Exactly one of amountUsd or shares; the other is null.", {
    type: "object",
    additionalProperties: false,
    properties: {
      ticker: { type: "string", minLength: 2, maxLength: 13 },
      side: { type: "string", enum: ["buy", "sell"] },
      amountUsd: nullable("number", { minimum: 1 }),
      shares: nullable("number", { exclusiveMinimum: 0 }),
      note: nullable("string", { maxLength: 280, description: "The person's reasoning, if given." }),
    },
    required: ["ticker", "side", "amountUsd", "shares", "note"],
  }),
  strictTool("explain_plan", "What one plan does, its status, and its last few log lines, in the app's own words.", {
    type: "object",
    additionalProperties: false,
    properties: { planId: { type: "string", minLength: 8, maxLength: 64 } },
    required: ["planId"],
  }),
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

/** The full schema (with the length and range rules) the validator checks tool inputs against. */
export function toolSchema(name: string): JsonSchema | undefined {
  return FULL_SCHEMAS.get(name);
}
