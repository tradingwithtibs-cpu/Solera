import { NAME_MAX } from "./profiles";

/** The email form's pure parts: error wording and pre-flight checks, kept free of React so they can be tested. */
export const PASSWORD_MIN = 8;

/** Supabase Auth's messages, said the way the sheet says things. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) return "That email and password don't match.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists")) return "That email already has an account. Log in instead.";
  if (m.includes("email not confirmed")) return "Confirm the email from your inbox first, then log in.";
  if (m.includes("password") && (m.includes("at least") || m.includes("weak") || m.includes("short"))) return `Use at least ${PASSWORD_MIN} characters.`;
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("email logins are disabled") || m.includes("provider is disabled")) return "Email sign-up isn't switched on for this deployment yet.";
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "That doesn't look like an email address.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Couldn't reach the sign-in service. Check your connection.";
  return message;
}

/** What is wrong with the form before it is sent, or null. */
export function validateEmailForm(tab: "login" | "signup", fields: { name: string; email: string; password: string }): string | null {
  const name = fields.name.trim();
  if (tab === "signup" && (name.length < 2 || name.length > NAME_MAX)) return `A display name is 2 to ${NAME_MAX} characters.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) return "That doesn't look like an email address.";
  if (fields.password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  return null;
}
