import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client (shared instance with internal-admin). Reads the
// same tables from supabase/migrations/0002_product.sql. Returns null until env
// is set, so the candidate app builds/renders on mock data before the backend
// is wired.
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
