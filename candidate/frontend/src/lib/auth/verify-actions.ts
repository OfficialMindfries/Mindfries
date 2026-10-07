"use server";

import { db } from "../supabase";
import { sendVerification } from "./email-links";
import { currentCandidate } from "./users";

/**
 * Sends the confirmation link again, to the signed-in candidate's own
 * address — read from their row, not from the request. Returns the sentence
 * to show them.
 */
export async function resendVerification(): Promise<string> {
  const session = await currentCandidate();
  const c = db();
  if (!session || !c) return "Sign in again and retry.";

  const { data } = await c.from("candidate_users").select("id, email, name, email_verified_at").eq("id", session.id).maybeSingle();
  if (!data) return "Sign in again and retry.";
  if (data.email_verified_at) return "It's already confirmed.";

  const result = await sendVerification({ id: data.id as string, email: data.email as string, name: data.name as string });
  switch (result) {
    case "sent":
      return "Sent — check your inbox. The link works for 48 hours.";
    case "too_many":
      return "Several links were sent in the last hour. Use the most recent one, or try again later.";
    case "not_configured":
      return "This site isn't set up to send email yet.";
    default:
      return "The message couldn't be sent. Try again in a moment.";
  }
}
