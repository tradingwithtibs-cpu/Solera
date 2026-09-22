/**
 * Fills for ticker badges and wallet avatars. Eight ink-safe tokens
 * (white text ≥ 4.5:1 on each, see docs/port/design-system.md §4.11),
 * exposed as CSS variables so a fill is a `style`, never a Tailwind
 * palette class that the dark remap would wash out.
 */
export const TK_TOKENS = [
  "var(--color-tk-1)",
  "var(--color-tk-2)",
  "var(--color-tk-3)",
  "var(--color-tk-4)",
  "var(--color-tk-5)",
  "var(--color-tk-6)",
  "var(--color-tk-7)",
  "var(--color-tk-8)",
] as const;

/** Stable token for any string (symbol, address, id). */
export function tokenFor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TK_TOKENS[hash % TK_TOKENS.length];
}

/**
 * A CSS colour for a stored fill. New data carries a `var(--color-tk-n)`;
 * older entries (and anything still on a Tailwind class name such as
 * "bg-violet-500") are mapped to a token by name so nothing renders lilac
 * with white initials.
 */
export function fillFor(color: string | undefined, fallbackKey = ""): string {
  if (!color) return tokenFor(fallbackKey);
  if (color.startsWith("var(") || color.startsWith("#") || color.startsWith("rgb")) return color;
  return tokenFor(color);
}
