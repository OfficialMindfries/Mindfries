"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireCompanyPermission } from "@/lib/auth/company-users";
import { addReportAnnotation, setReviewerDecision } from "@/lib/db";

export type ReviewState = { error: string | null; success: boolean };

const RECOMMENDATIONS = new Set(["strong_hire", "hire", "lean_no", "no_hire"]);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

/**
 * Reviewing a report is deciding about a candidate, so it takes the same
 * permission as moving them through the pipeline. Both actions go through
 * the application id, which lib/db checks against the signed-in company —
 * a report id never comes from the browser.
 */
async function reviewer() {
  return requireCompanyPermission("candidate:stage");
}

/** Adds a note or correction to a section of the report (`category`), or to the report as a whole (null). */
export async function addAnnotation(applicationId: string, category: string | null, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  let user;
  try {
    user = await reviewer();
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }
  const body = text(form.get("body"), 4000);
  if (!body) return { error: "Write the note first.", success: false };
  try {
    await addReportAnnotation(user.companyId, applicationId, {
      category,
      kind: category && form.get("kind") === "correction" ? "correction" : "note",
      body,
      authorName: user.name || user.email,
      authorEmail: user.email,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the note — try again.", success: false };
  }
  revalidatePath(`/candidates/${applicationId}`);
  return { error: null, success: true };
}

/** Records the reviewer's own decision beside the AI's recommendation. An empty choice clears it. */
export async function saveReviewerDecision(applicationId: string, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  let user;
  try {
    user = await reviewer();
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }
  const choice = text(form.get("recommendation"), 32);
  if (choice && !RECOMMENDATIONS.has(choice)) return { error: "Pick one of the listed decisions.", success: false };
  try {
    await setReviewerDecision(user.companyId, applicationId, {
      recommendation: choice || null,
      note: text(form.get("note"), 4000) || null,
      by: user.name || user.email,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the decision — try again.", success: false };
  }
  revalidatePath(`/candidates/${applicationId}`);
  return { error: null, success: true };
}
