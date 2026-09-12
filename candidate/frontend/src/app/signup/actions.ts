"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAccount } from "@/lib/auth/users";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, sessionSecret } from "@/lib/auth/session";

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

  const result = await createAccount(name, email, password);
  if (!result.ok) return { error: result.error };

  // A new account signs straight in — there's no email step to wait on,
  // because nothing here sends one.
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
