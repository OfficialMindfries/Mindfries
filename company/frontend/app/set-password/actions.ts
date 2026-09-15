"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeInvite } from "@/lib/auth/company-users";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, sessionSecret } from "@/lib/auth/session";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type SetPasswordState = { error: string | null };

export async function setPassword(_prev: SetPasswordState, form: FormData): Promise<SetPasswordState> {
  const secret = sessionSecret();
  if (!secret) {
    return { error: "SESSION_SECRET is missing or too short (needs 32+ characters). Add it to .env.local." };
  }

  const token = text(form.get("token"), 2048);
  const password = text(form.get("password"), 512);
  const confirm = text(form.get("confirm"), 512);
  if (password !== confirm) return { error: "Those passwords don't match." };

  const result = await completeInvite(token, password);
  if (!result.ok) return { error: result.error };

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
