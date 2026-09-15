import "server-only";
import { cookies } from "next/headers";
import { db } from "../supabase";
import { dummyWork, hashPassword, verifyPassword } from "./password";
import { readSession, SESSION_COOKIE, sessionSecret, type Session } from "./session";
import { readInviteToken, inviteSecret } from "./invite-token";
import { can, type Action } from "./permissions";
import type { CompanyRole } from "@/lib/types";

// Deciding who may sign in, and reading back who did.
//
// Unlike internal-admin's admin_users, there is deliberately no
// environment-configured root account here (IMPLEMENTATION.md §6): a
// locked-out company should reach Mindfries support, not have a shared
// backdoor credential into every company's data.
//
// A row with an empty password_hash (just created via the invite flow, or
// still `status = 'invited'`) can never sign in here — verifyPassword's
// format check rejects it outright, and the status check below is a second,
// independent reason it would fail even if that changed.

export interface CompanyUserRow {
  id: string;
  company_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: CompanyRole;
  status: "invited" | "active" | "disabled";
  failed_attempts: number;
  locked_until: string | null;
  companies?: { name: string } | null;
}

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export type SignInResult =
  | { ok: true; session: Omit<Session, "exp"> }
  | { ok: false; error: string };

/**
 * One message for every failure, same reasoning as internal-admin's
 * checkCredentials: distinguishing "no such account" from "wrong password"
 * tells anyone who asks which addresses have access here.
 */
const REFUSED = "That email and password don't match.";

export async function checkCredentials(emailRaw: string, password: string): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: REFUSED };

  const c = db();
  if (!c) {
    await dummyWork();
    return { ok: false, error: REFUSED };
  }

  const { data, error } = await c
    .from("company_users")
    .select("*, companies(name)")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      return { ok: false, error: "The company_users table doesn't exist yet. Run the migrations." };
    }
    return { ok: false, error: REFUSED };
  }

  const row = data as CompanyUserRow | null;
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
      .from("company_users")
      .update({
        failed_attempts: attempts,
        locked_until: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", row.id);
    return { ok: false, error: REFUSED };
  }

  await c.from("company_users").update({ failed_attempts: 0, locked_until: null }).eq("id", row.id);

  return {
    ok: true,
    session: {
      email: row.email,
      name: row.name,
      role: row.role,
      companyId: row.company_id,
      companyName: row.companies?.name ?? "",
    },
  };
}

/** The signed-in company user, or null. Reads the cookie; never trusts a header. */
export async function currentCompanyUser(): Promise<Session | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
}

export type InviteLookup =
  | { ok: true; email: string; companyName: string }
  | { ok: false; error: string };

/** Verifies a /set-password link and returns who it's for, without touching the password yet — used to render the confirmation page. */
export async function lookupInvite(token: string | undefined | null): Promise<InviteLookup> {
  const claims = await readInviteToken(token, inviteSecret());
  if (!claims) return { ok: false, error: "This link is invalid or has expired. Ask whoever invited you to send a new one." };

  const c = db();
  if (!c) return { ok: false, error: "The company_users table doesn't exist yet. Run the migrations." };

  const { data } = await c
    .from("company_users")
    .select("id, email, status, companies(name)")
    .eq("id", claims.companyUserId)
    .maybeSingle<{ id: string; email: string; status: string; companies: { name: string } | null }>();
  if (!data || data.email !== claims.email) {
    return { ok: false, error: "This link is invalid or has expired. Ask whoever invited you to send a new one." };
  }
  if (data.status === "disabled") {
    return { ok: false, error: "This account has been disabled. Ask a company admin for help." };
  }
  return { ok: true, email: data.email, companyName: data.companies?.name ?? "" };
}

export type CompleteInviteResult =
  | { ok: true; session: Omit<Session, "exp"> }
  | { ok: false; error: string };

/**
 * Sets a password on an invited (or disabled — a re-issued link can also
 * reactivate one) account and signs it in. This is the only way a
 * company_users row ever gets a real password_hash: nobody, including
 * Mindfries ops, ever sets one on someone else's behalf (IMPLEMENTATION.md
 * §6).
 */
export async function completeInvite(token: string | undefined | null, password: string): Promise<CompleteInviteResult> {
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };

  const claims = await readInviteToken(token, inviteSecret());
  if (!claims) return { ok: false, error: "This link is invalid or has expired. Ask whoever invited you to send a new one." };

  const c = db();
  if (!c) return { ok: false, error: "The company_users table doesn't exist yet. Run the migrations." };

  const { data } = await c
    .from("company_users")
    .select("*, companies(name)")
    .eq("id", claims.companyUserId)
    .maybeSingle();
  const row = data as CompanyUserRow | null;
  if (!row || row.email !== claims.email) {
    return { ok: false, error: "This link is invalid or has expired. Ask whoever invited you to send a new one." };
  }

  const password_hash = await hashPassword(password);
  const { error } = await c
    .from("company_users")
    .update({ password_hash, status: "active", failed_attempts: 0, locked_until: null })
    .eq("id", row.id);
  if (error) return { ok: false, error: "Couldn't save that — try again." };

  return {
    ok: true,
    session: {
      email: row.email,
      name: row.name,
      role: row.role,
      companyId: row.company_id,
      companyName: row.companies?.name ?? "",
    },
  };
}

/**
 * Thrown by requireCompanyPermission — a distinct type so a caller can tell
 * "you're not allowed" apart from any other failure without string-matching
 * an error message.
 */
export class ForbiddenError extends Error {}

/**
 * Every mutating server action calls this first, naming the specific action
 * it's about to take rather than just "are you an admin" — the permission
 * matrix (lib/auth/permissions.ts) is the one place that maps roles to what
 * they can do, so a future change to that matrix doesn't require touching
 * every action that checks it.
 */
export async function requireCompanyPermission(action: Action): Promise<Session> {
  const session = await currentCompanyUser();
  if (!session) throw new ForbiddenError("Not signed in.");
  if (!can(action, session.role)) {
    throw new ForbiddenError("Your role doesn't allow this — ask a company admin.");
  }
  return session;
}
