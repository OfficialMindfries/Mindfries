"use server";

import { redirect } from "next/navigation";
import { BackendAuthError, backendReady, startSession } from "@/lib/backend/client";

/**
 * Called from the final Lobby step when the candidate clicks "Enter Workspace".
 * This is the moment the live session is created in the database — not when
 * "Start assessment" is clicked on the dashboard, and not when the onboarding
 * wizard opens. The timer and evidence capture begin from here.
 *
 * templateId comes from the real assessment the candidate picked on the
 * dashboard (threaded through as a query param the whole way — see
 * src/app/dashboard/actions.ts) — never a hardcoded placeholder. The
 * candidate's own identity is never passed in either: the backend derives
 * it itself from the signed "mf_candidate" cookie this call forwards, which
 * is also what makes the session it creates belong to this candidate and no
 * one else, enforced on the Go side rather than asserted here.
 *
 * On failure, this returns an error for the Lobby to show instead of
 * silently opening the workspace anyway — entering without a tracked
 * session would defeat the product's whole premise (PRD §2.2's evidence
 * principle), so a failed start is surfaced, not swallowed.
 */
export async function enterWorkspace(templateId: string): Promise<{ error: string } | never> {
  if (!templateId) {
    return { error: "No assessment selected. Go back to your dashboard and start one from there." };
  }

  if (!backendReady()) {
    // Same honest degrade as the dashboard/assessments pages: without a
    // configured backend there's nothing to record a session into, but that
    // isn't a reason to block the workspace itself from opening.
    redirect("/ide");
  }

  try {
    const session = await startSession(templateId);
    redirect(`/ide?session=${encodeURIComponent(session.id)}`);
  } catch (err) {
    if (err instanceof BackendAuthError) redirect("/login?next=/onboarding");
    if (isRedirectError(err)) throw err; // let Next's own redirect() propagate, don't treat it as a failure
    return {
      error: err instanceof Error ? err.message : "Could not start the assessment. Please try again.",
    };
  }
}

// next/navigation's redirect() works by throwing; a broad catch above must
// let that throw keep propagating instead of reporting it as an error.
function isRedirectError(err: unknown): boolean {
  return !!err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}
