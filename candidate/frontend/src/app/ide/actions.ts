"use server";

import { redirect } from "next/navigation";
import { BackendAuthError, submitSession } from "@/lib/backend/client";
import { isRedirectError } from "@/lib/isRedirectError";

/**
 * The workspace's Submit button, wired for real: ends the session on the
 * backend (candidate/backend's Assessment Orchestrator marks it submitted
 * and kicks off evaluation) and sends the candidate to the report page to
 * watch it land. Previously this only flipped local UI state to a
 * "Work submitted" screen — nothing was ever actually submitted anywhere.
 *
 * sessionId is the id IdeShell was opened with (?session=<id> from
 * onboarding's enterWorkspace) — a workspace opened without one (backend
 * unconfigured when it was entered, or opened directly at /ide) has nothing
 * real to submit, and the caller should keep the local-only confirmation
 * screen rather than call this at all.
 */
export async function submitAssessment(sessionId: string): Promise<{ error: string } | never> {
  try {
    await submitSession(sessionId);
  } catch (err) {
    if (err instanceof BackendAuthError) redirect(`/login?next=/ide`);
    if (isRedirectError(err)) throw err;
    return { error: err instanceof Error ? err.message : "Could not submit. Please try again." };
  }
  redirect(`/assessments/${encodeURIComponent(sessionId)}/report`);
}
