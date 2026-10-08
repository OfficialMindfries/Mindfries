import "server-only";
import { db } from "../supabase";
import type { Session } from "./session";

// Whether a signed session still counts.
//
// The cookie proves who it was issued to and when; it can't know what has
// happened since. This asks the account: is it still active, and has it
// withdrawn its sessions (a password reset, "sign out of all devices") at
// some point after this one was issued?
//
// candidate/backend asks the same question of the same column
// (internal/httpapi/middleware.go), so a withdrawn session stops working on
// both sides.

/** A session issued before `validFrom` no longer counts. Compared by the second: a cookie carries whole seconds. */
export function issuedBefore(session: Pick<Session, "iat">, validFrom: string | null | undefined): boolean {
  if (!validFrom) return false;
  const from = Date.parse(validFrom);
  if (Number.isNaN(from)) return false;
  // A cookie from before issue times were recorded has none, and is older
  // than any withdrawal.
  return (session.iat ?? 0) < Math.floor(from / 1000);
}

/**
 * True when the account behind this session is active and hasn't withdrawn
 * it. Without a database (sample-data mode) there is no account to ask and
 * the signature is all there is. If the database can't be reached the
 * session is let through — everything it would go on to read needs the same
 * database, and a brief outage shouldn't sign every candidate out.
 */
export async function sessionStillValid(session: Session): Promise<boolean> {
  const c = db();
  if (!c) return true;
  const { data, error } = await c.from("candidate_users").select("status, sessions_valid_from").eq("id", session.id).maybeSingle();
  if (error) {
    console.error("auth: couldn't check whether a session was withdrawn:", error.message);
    return true;
  }
  if (!data) return false; // the account is gone
  if (data.status !== "active") return false;
  return !issuedBefore(session, data.sessions_valid_from as string | null);
}

/** Withdraws every session this account has, on every device. */
export async function withdrawSessions(candidateId: string): Promise<boolean> {
  const c = db();
  if (!c) return false;
  const { error } = await c.from("candidate_users").update({ sessions_valid_from: new Date().toISOString() }).eq("id", candidateId);
  return !error;
}
