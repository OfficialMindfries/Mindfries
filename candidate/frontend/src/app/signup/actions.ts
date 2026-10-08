"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAccount } from "@/lib/auth/users";
import { sendVerification } from "@/lib/auth/email-links";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, sessionSecret } from "@/lib/auth/session";
import { attemptsExceeded, noteAttempt, waitMessage } from "@/lib/auth/throttle";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type SignUpState = { error: string | null };

export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const secret = sessionSecret();
  if (!secret) {
    return { error: "SESSION_SECRET is missing or too short (needs 32+ characters). Add it to .env.local." };
  }

  const name = text(form.get("name"), 200);
  const email = text(form.get("email"), 254);
  const password = text(form.get("password"), 512);
  const confirm = text(form.get("confirm"), 512);
  if (password !== confirm) return { error: "Those passwords don't match." };

  const wait = await attemptsExceeded("signup");
  if (wait > 0) return { error: waitMessage(wait) };

  const result = await createAccount(name, email, password);
  if (!result.ok) return { error: result.error };
  await noteAttempt("signup");

  // A new account signs straight in, and is mailed a link to confirm its
  // address. Sign-up doesn't wait on that link or fail without it: an
  // unconfirmed account works, and says so to the candidate and to hiring
  // teams until the link is opened. Where mail isn't configured nothing is
  // sent, and the dashboard doesn't ask for a confirmation it can't offer.
  await sendVerification(result.session).catch(() => undefined);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(result.session, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect("/dashboard");
}
