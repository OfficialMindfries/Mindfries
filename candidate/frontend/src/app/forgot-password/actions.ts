"use server";

import { requestPasswordReset } from "@/lib/auth/email-links";
import { attemptsExceeded, noteAttempt, waitMessage } from "@/lib/auth/throttle";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type ForgotState = { done: boolean; error: string | null };

/**
 * Always answers the same way for any address, registered or not — the form
 * is public, and a different answer would tell anyone who asks which
 * addresses have accounts. The one thing it does say plainly is when this
 * site can't send mail at all, because "check your inbox" would then be a
 * lie to everyone.
 */
export async function forgotPassword(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const email = text(form.get("email"), 254).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { done: false, error: "That doesn't look like an email address." };

  // Counted whether or not the address has an account, so the count says
  // nothing about which do.
  const wait = await attemptsExceeded("reset");
  if (wait > 0) return { done: false, error: waitMessage(wait) };
  await noteAttempt("reset");

  const result = await requestPasswordReset(email);
  if (result === "not_configured") {
    return { done: false, error: "This site isn't set up to send email yet, so a reset link can't be sent. Write to officemindfries@gmail.com and we'll help." };
  }
  return { done: true, error: null };
}
