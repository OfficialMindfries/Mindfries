import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../supabase";
import { dummyWork, hashPassword, verifyPassword } from "./password";
import { readSession, SESSION_COOKIE, sessionSecret, type Session } from "./session";
import { sessionStillValid } from "./revocation";

// Deciding who may sign in, who may create an account, and reading back who
// did — the candidate-side counterpart to internal-admin's lib/auth/admins.ts,
// with one real difference: a candidate account is self-serve. There's no CLI
// and no root fallback here, because there's no small known set of people to
// add by hand the way there is for admin ops staff — anyone can sign up.

export interface CandidateRow {
  id: string;
  email: string;
  name: string;
  /** Null for an account created purely through OAuth — see oauth-login.ts. */
  password_hash: string | null;
  status: "active" | "disabled";
  failed_attempts: number;
  locked_until: string | null;
  role: string | null;
  location: string | null;
  bio: string | null;
  notice_period: string | null;
  open_to: string[] | null;
  resume_path: string | null;
  links: any;
  profile_updated_at: string | null;
}

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

export type SignInResult = { ok: true; session: Omit<Session, "exp" | "iat"> } | { ok: false; error: string };

/**
 * One message for every login failure. "No such account" and "wrong
 * password" are the same sentence on purpose: distinguishing them tells
 * anyone who asks which addresses have signed up here.
 */
const REFUSED = "That email and password don't match.";

const emailShape = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function checkCredentials(emailRaw: string, password: string): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: REFUSED };

  const c = db();
  if (!c) {
    await dummyWork();
    return { ok: false, error: REFUSED };
  }

  const { data, error } = await c.from("candidate_users").select("*").eq("email", email).maybeSingle();
  if (error) {
    // A missing table is a setup problem, not a bad password — say so rather
    // than telling someone their own password is wrong.
    if ((error as { code?: string }).code === "PGRST205") {
      return { ok: false, error: "The candidate_users table doesn't exist yet. Run the migrations." };
    }
    return { ok: false, error: REFUSED };
  }

  const row = data as CandidateRow | null;
  if (!row) {
    await dummyWork();
    return { ok: false, error: REFUSED };
  }
  if (row.status !== "active") {
    await dummyWork();
    return { ok: false, error: REFUSED };
  }
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
    const mins = Math.ceil((Date.parse(row.locked_until) - Date.now()) / 60000);
    return { ok: false, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  if (!(await verifyPassword(password, row.password_hash))) {
    const attempts = row.failed_attempts + 1;
    await c
      .from("candidate_users")
      .update({
        failed_attempts: attempts,
        locked_until: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", row.id);
    return { ok: false, error: REFUSED };
  }

  await c
    .from("candidate_users")
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true, session: { id: row.id, email: row.email, name: row.name } };
}

export type SignUpResult = { ok: true; session: Omit<Session, "exp" | "iat"> } | { ok: false; error: string };

/**
 * Creates a real row — a scrypt hash with its own salt, never the password
 * itself — and signs the new candidate in immediately. The address starts
 * unconfirmed (email_verified_at null); the sign-up action mails the link
 * that confirms it (lib/auth/email-links.ts).
 */
export async function createAccount(nameRaw: string, emailRaw: string, password: string): Promise<SignUpResult> {
  const name = nameRaw.trim().slice(0, 200);
  const email = emailRaw.trim().toLowerCase().slice(0, 254);

  if (!name) return { ok: false, error: "Enter your name." };
  if (!emailShape(email)) return { ok: false, error: "That doesn't look like an email address." };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };

  const c = db();
  if (!c) return { ok: false, error: "Supabase isn't configured yet — accounts can't be created." };

  const { data: existing, error: lookupError } = await c
    .from("candidate_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupError && (lookupError as { code?: string }).code === "PGRST205") {
    return { ok: false, error: "The candidate_users table doesn't exist yet. Run the migrations." };
  }
  // Telling someone an email is already registered is normal for a signup
  // form — unlike login, where the same distinction would let someone probe
  // for which addresses have accounts, signup is the one place that
  // question is already being asked on purpose.
  if (existing) return { ok: false, error: "An account with that email already exists — try signing in instead." };

  const password_hash = await hashPassword(password);
  const { data: row, error } = await c
    .from("candidate_users")
    .insert({ name, email, password_hash })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "Couldn't create your account — try again in a moment." };

  return { ok: true, session: { id: row.id as string, email, name } };
}

/**
 * The signed-in candidate, or null. Reads the cookie; never trusts a header.
 *
 * A good signature is not the whole answer: the account may have been
 * disabled, or have withdrawn its sessions since this one was issued
 * (lib/auth/revocation.ts). Such a session is sent to /api/auth/ended, which
 * clears the cookie and lands on the sign-in page — the middleware, which
 * only checks signatures, would otherwise keep sending it back in.
 *
 * Asked once per request however many callers there are.
 */
export const currentCandidate = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!session) return null;
  if (!(await sessionStillValid(session))) redirect("/api/auth/ended");
  return session;
});
