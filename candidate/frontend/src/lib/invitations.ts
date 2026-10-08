"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { currentCandidate } from "./auth/users";
import { mailerReady } from "./mailer";

// A candidate's answer to an invitation (assessments.accepted_at /
// declined_at, 0019_invitations_and_setup.sql).
//
// Both actions act only on an invitation addressed to the signed-in
// candidate's own email and still open — the id in the request picks which
// one, never whose. Accepting says "I'll do this"; it doesn't start
// anything, and the clock begins only when the workspace is entered.
// Declining closes the invitation: the backend starts a session only for an
// invitation whose status is 'invited'.

export type InvitationResult = { ok: true } | { ok: false; error: string };

const GONE = "That invitation is no longer open.";

async function answer(assessmentId: string, change: Record<string, unknown>, stage?: string): Promise<InvitationResult> {
  const candidate = await currentCandidate();
  if (!candidate) return { ok: false, error: "Sign in again and retry." };
  const c = db();
  if (!c) return { ok: false, error: "The database isn't connected." };
  if (!/^[0-9a-f-]{36}$/i.test(assessmentId)) return { ok: false, error: GONE };

  const { data, error } = await c
    .from("assessments")
    .update(change)
    .eq("id", assessmentId)
    .eq("candidate_email", candidate.email)
    .eq("status", "invited")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't save that — try again in a moment." };
  if (!data) return { ok: false, error: GONE };

  // The company's pipeline reads candidate_applications, not assessments.
  if (stage) await c.from("candidate_applications").update({ stage }).eq("assessment_id", assessmentId);

  revalidatePath("/dashboard");
  revalidatePath("/assessments");
  return { ok: true };
}

export async function acceptInvitation(assessmentId: string): Promise<InvitationResult> {
  // An invitation is addressed to an email, and an account is made by typing
  // one in. Where this site can send mail — so confirming is possible — an
  // invitation is only taken up from a confirmed address. candidate/backend
  // holds the same line at the start of the session (REQUIRE_VERIFIED_EMAIL).
  if (mailerReady()) {
    const candidate = await currentCandidate();
    const c = db();
    if (candidate && c) {
      const { data } = await c.from("candidate_users").select("email_verified_at").eq("id", candidate.id).maybeSingle();
      if (data && !data.email_verified_at) {
        return { ok: false, error: "Confirm your email address first — use the link we emailed you, or send a new one from the notice at the top of your dashboard." };
      }
    }
  }
  return answer(assessmentId, { accepted_at: new Date().toISOString() });
}

export async function declineInvitation(assessmentId: string, reasonRaw: string): Promise<InvitationResult> {
  const reason = String(reasonRaw ?? "").trim().slice(0, 500);
  return answer(
    assessmentId,
    { status: "declined", declined_at: new Date().toISOString(), decline_reason: reason || null },
    "declined",
  );
}
