"use server";

import { redirect } from "next/navigation";
import { resetPassword } from "@/lib/auth/email-links";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type ResetState = { error: string | null };

/**
 * Sets the new password and sends the person to sign in with it. It does
 * not sign them in itself: a reset link in a mailbox is a way to choose a
 * password, and the password is then what opens the account.
 */
export async function choosePassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const token = text(form.get("token"), 200);
  const password = text(form.get("password"), 512);
  const confirm = text(form.get("confirm"), 512);
  if (password !== confirm) return { error: "Those passwords don't match." };

  const result = await resetPassword(token, password);
  if (!result.ok) return { error: result.error };

  redirect("/login?reset=1");
}
