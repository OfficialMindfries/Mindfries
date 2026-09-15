import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Single server-side client using the service-role key. The browser NEVER
// imports this — all company data flows through server components / actions
// / route handlers. Returns null until env is set, so the app builds and
// renders (with empty states) before Supabase is wired for this environment.
let cached: SupabaseClient | null | undefined;

export function supabaseReady(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function db(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}
