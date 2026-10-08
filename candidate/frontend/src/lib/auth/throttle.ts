import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { db } from "../supabase";
import { sessionSecret } from "./session";

// Slowing the public account forms down by the network a request comes from.
//
// The lock on an account (lib/auth/users.ts) stops guessing at one account.
// It does nothing about one machine trying a few passwords against each of a
// thousand accounts, or creating accounts in a loop, or asking for reset
// mail for every address it can think of — those are counted here, by
// address, in the database so that every server instance sees the same count
// (supabase/migrations/0020).
//
// The limits are far above what a person does and well below what a script
// wants. A shared office or campus address is the case to be careful of,
// which is why sign-in counts only failures.
//
// If the count can't be read, the request goes ahead: these forms have their
// own protections, and a database hiccup shouldn't lock everyone out.

export type AttemptKind = "login" | "signup" | "reset";

const LIMITS: Record<AttemptKind, { max: number; minutes: number }> = {
  /** Failed sign-ins. */
  login: { max: 20, minutes: 15 },
  /** Accounts created. */
  signup: { max: 8, minutes: 60 },
  /** Reset links asked for. */
  reset: { max: 8, minutes: 60 },
};

/**
 * A keyed hash of the caller's address, or null when it can't be told.
 *
 * The first address in x-forwarded-for is the one the hosting platform saw
 * (Vercel sets the header itself and discards any the client sent). With no
 * proxy in front — local development — there is no header and nothing is
 * counted.
 */
async function callerKey(): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const h = await headers();
  const address = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  if (!address) return null;
  return createHmac("sha256", secret).update(`auth-attempt:${address}`).digest("hex").slice(0, 40);
}

/** How long, in minutes, this caller should wait before trying `kind` again — 0 when they may go ahead. */
export async function attemptsExceeded(kind: AttemptKind): Promise<number> {
  const c = db();
  const key = await callerKey();
  if (!c || !key) return 0;
  const { max, minutes } = LIMITS[kind];
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await c
    .from("candidate_auth_attempts")
    .select("at")
    .eq("ip_hash", key)
    .eq("kind", kind)
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(max);
  if (error || !data || data.length < max) return 0;
  // The oldest of the last `max` is the one that has to age out.
  const oldest = Date.parse(data[data.length - 1].at as string);
  return Math.max(1, Math.ceil((oldest + minutes * 60_000 - Date.now()) / 60_000));
}

/** Counts one attempt of `kind` against this caller. */
export async function noteAttempt(kind: AttemptKind): Promise<void> {
  const c = db();
  const key = await callerKey();
  if (!c || !key) return;
  await c.from("candidate_auth_attempts").insert({ ip_hash: key, kind });
  // Old rows are no use to anyone; clear them now and then rather than on a schedule.
  if (Math.random() < 0.02) {
    await c.from("candidate_auth_attempts").delete().lt("at", new Date(Date.now() - 24 * 3600_000).toISOString());
  }
}

export const waitMessage = (minutes: number) =>
  `Too many attempts from this network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
