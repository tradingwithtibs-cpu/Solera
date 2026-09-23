/**
 * A tiny JSON Schema checker for tool inputs. Claude's strict mode
 * guarantees schema-valid input, but the mock model never goes through the
 * API and a hand-built input can still be wrong, so every tool validates
 * again before it runs. Covers exactly the subset the tool schemas use.
 */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeOk(expected: string, actual: string): boolean {
  return expected === actual || (expected === "number" && actual === "integer");
}

/** The first problem with `value` against `schema`, or null. */
export function validateAgainst(schema: JsonSchema, value: unknown, path = "input"): string | null {
  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(t, actual))) return `${path} should be ${types.join(" or ")}, got ${actual}`;
  }
  if (schema.enum && !schema.enum.includes(value)) return `${path} should be one of ${schema.enum.map(String).join(", ")}`;
  if (actual === "string") {
    const s = value as string;
    if (schema.minLength !== undefined && s.length < schema.minLength) return `${path} is too short`;
    if (schema.maxLength !== undefined && s.length > schema.maxLength) return `${path} is too long`;
  }
  if (actual === "number" || actual === "integer") {
    const n = value as number;
    if (!Number.isFinite(n)) return `${path} should be a finite number`;
    if (schema.minimum !== undefined && n < schema.minimum) return `${path} should be at least ${schema.minimum}`;
    if (schema.exclusiveMinimum !== undefined && n <= schema.exclusiveMinimum) return `${path} should be more than ${schema.exclusiveMinimum}`;
    if (schema.maximum !== undefined && n > schema.maximum) return `${path} should be at most ${schema.maximum}`;
  }
  if (actual === "array") {
    const arr = value as unknown[];
    if (schema.minItems !== undefined && arr.length < schema.minItems) return `${path} needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}`;
    if (schema.maxItems !== undefined && arr.length > schema.maxItems) return `${path} has more than ${schema.maxItems} items`;
    if (schema.items) {
      for (let i = 0; i < arr.length; i++) {
        const problem = validateAgainst(schema.items, arr[i], `${path}[${i}]`);
        if (problem) return problem;
      }
    }
  }
  if (actual === "object" && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) return `${path}.${key} is required`;
    for (const [key, v] of Object.entries(obj)) {
      const sub = schema.properties[key];
      if (!sub) {
        if (schema.additionalProperties === false) return `${path}.${key} is not a known field`;
        continue;
      }
      const problem = validateAgainst(sub, v, `${path}.${key}`);
      if (problem) return problem;
    }
  }
  return null;
}

/** Strict-mode hygiene: every object closes additionalProperties and lists every property as required, recursively. */
export function strictProblems(schema: JsonSchema, path = "input_schema"): string[] {
  const out: string[] = [];
  const isObject = schema.type === "object" || (Array.isArray(schema.type) && schema.type.includes("object"));
  if (isObject) {
    if (schema.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
    const props = Object.keys(schema.properties ?? {});
    const required = schema.required ?? [];
    for (const p of props) if (!required.includes(p)) out.push(`${path}.${p}: must be listed in required`);
    for (const r of required) if (!props.includes(r)) out.push(`${path}.${r}: required but not a property`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) out.push(...strictProblems(sub, `${path}.${k}`));
  }
  if (schema.items) out.push(...strictProblems(schema.items, `${path}[]`));
  return out;
}
