import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional: without the env vars the app runs exactly as
 * before, just without claimable profiles. Two clients:
 * - the anon (publishable) client, safe in the browser, read-only by RLS;
 * - the service-role client, server-only, used by /api/profile after a
 *   wallet signature has been verified.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return !!url && !!anonKey;
}

let anon: SupabaseClient | null = null;
export function getSupabaseAnon(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  anon ??= createClient(url, anonKey, { auth: { persistSession: false } });
  return anon;
}

let service: SupabaseClient | null = null;
/** Server only. Returns null when the service key isn't configured. */
export function getSupabaseService(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  service ??= createClient(url, key, { auth: { persistSession: false } });
  return service;
}
