"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkCredentials } from "@/lib/auth/users";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, sessionSecret } from "@/lib/auth/session";

// A server action is a public HTTP endpoint, so everything here is treated as
// coming from anyone: inputs are capped before they reach the database, and
// the only thing that decides the outcome is checkCredentials.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type LoginState = { error: string | null };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const secret = sessionSecret();
  if (!secret) {
    return { error: "SESSION_SECRET is missing or too short (needs 32+ characters). Add it to .env.local." };
  }

  const email = text(form.get("email"), 254);
  const password = text(form.get("password"), 512);

  const result = await checkCredentials(email, password);
  if (!result.ok) return { error: result.error };

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(result.session, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // Only ever a path on this site. A caller-supplied absolute URL here would
  // make the login page a redirector to anywhere.
  const wanted = text(form.get("next"), 512);
  const safe = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/dashboard";
  redirect(safe);
}

/**
 * Called from the account menu (a client component) as well as anywhere
 * server-side — Next allows a "use server" export to be imported directly
 * into client code, same as startAssessment already is from AssessmentWall.
 */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
