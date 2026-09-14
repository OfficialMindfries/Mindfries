import "server-only";
import { cookies } from "next/headers";
import { db } from "../supabase";
import { dummyWork, safeEqual, verifyPassword } from "./password";
import { readSession, SESSION_COOKIE, sessionSecret, type Session } from "./session";

// Deciding who may sign in, and reading back who did.
//
// Two kinds of account:
//
// - Rows in admin_users, added with scripts/admin.mts. The normal case.
// - One root account from the environment (ROOT_ADMIN_EMAIL /
//   ROOT_ADMIN_PASSWORD), always allowed. Without it, deleting the last row —
//   or pointing at a database where the table doesn't exist yet — would lock
//   everyone out of their own admin panel permanently.

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "viewer";
  status: "active" | "disabled";
  failed_attempts: number;
  locked_until: string | null;
}

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export const rootEmail = () => (process.env.ROOT_ADMIN_EMAIL ?? "").trim().toLowerCase();
const rootPassword = () => process.env.ROOT_ADMIN_PASSWORD ?? "";

export type SignInResult =
  | { ok: true; session: Omit<Session, "exp"> }
  | { ok: false; error: string };

/**
 * One message for every failure. "No such admin" and "wrong password" are the
 * same sentence on purpose: a login page that distinguishes them tells anyone
 * who asks which addresses have access here.
 */
const REFUSED = "That email and password don't match.";

export async function checkCredentials(emailRaw: string, password: string): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: REFUSED };

  // The root account is checked first and never touches the database, so it
  // works even when the schema is missing or Supabase is down.
  if (rootEmail() && email === rootEmail()) {
    const expected = rootPassword();
    if (!expected) {
      return { ok: false, error: "The root admin has no password set. Add ROOT_ADMIN_PASSWORD to .env.local." };
    }
    if (safeEqual(password, expected)) {
      return { ok: true, session: { email, name: "Root admin", role: "admin", root: true } };
    }
    return { ok: false, error: REFUSED };
  }

  const c = db();
  if (!c) {
    await dummyWork();
    return { ok: false, error: REFUSED };
  }

  const { data, error } = await c.from("admin_users").select("*").eq("email", email).maybeSingle();
  if (error) {
    // A missing table is a setup problem, not a bad password — say so rather
    // than telling someone their own password is wrong.
    if ((error as { code?: string }).code === "PGRST205") {
      return { ok: false, error: "The admin_users table doesn't exist yet. Run the migrations." };
    }
    return { ok: false, error: REFUSED };
  }

  const row = data as AdminRow | null;
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
      .from("admin_users")
      .update({
        failed_attempts: attempts,
        locked_until: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", row.id);
    return { ok: false, error: REFUSED };
  }

  await c
    .from("admin_users")
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true, session: { email: row.email, name: row.name, role: row.role, root: false } };
}

/** The signed-in admin, or null. Reads the cookie; never trusts a header. */
export async function currentAdmin(): Promise<Session | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
}

/**
 * Thrown by requireAdminRole — a distinct type so a caller that wants to
 * tell "you're not allowed" apart from any other failure can, without
 * string-matching an error message.
 */
export class ForbiddenError extends Error {}

/**
 * Every mutating server action calls this first. `role` has existed on the
 * session cookie since it was introduced — carried, and validated by the Go
 * backend's own session package — but nothing here ever actually read it:
 * a "viewer" account could call any of these exactly like a full "admin"
 * could. This is the one check that makes the role mean something, and it's
 * deliberately independent of which page the action happened to be invoked
 * from — a server action is its own HTTP endpoint (its id ships in the
 * page's JavaScript), so the page-level gate in app/admin/layout.tsx isn't
 * a substitute for checking here too.
 */
export async function requireAdminRole(): Promise<Session> {
  const session = await currentAdmin();
  if (!session) throw new ForbiddenError("Not signed in.");
  if (session.role !== "admin") throw new ForbiddenError("Your account is view-only — ask an admin to make this change.");
  return session;
}
