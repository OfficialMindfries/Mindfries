"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireCompanyPermission } from "@/lib/auth/company-users";
import { inviteCandidateToRole, setApplicationStage } from "@/lib/db";
import type { ApplicationStage } from "@/lib/types";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type InviteCandidateState = { error: string | null; success: boolean };

/**
 * Bound to a specific roleId in the client form (`inviteCandidate.bind(null, roleId)`)
 * so useActionState's (prevState, formData) signature still applies — the
 * roleId never comes from the form body, which keeps a crafted request from
 * inviting into a role this session doesn't own (getJobRole inside
 * inviteCandidateToRole checks that against companyId regardless).
 */
export async function inviteCandidate(roleId: string, _prev: InviteCandidateState, form: FormData): Promise<InviteCandidateState> {
  let companyId: string;
  try {
    companyId = (await requireCompanyPermission("candidate:invite")).companyId;
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }

  const email = text(form.get("candidateEmail"), 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "That doesn't look like an email address.", success: false };

  const candidateName = text(form.get("candidateName"), 200) || undefined;
  const dueDate = text(form.get("dueDate"), 10) || undefined;

  try {
    await inviteCandidateToRole({ companyId, jobRoleId: roleId, candidateEmail: email, candidateName, dueDate });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't invite that candidate — try again.", success: false };
  }

  revalidatePath(`/roles/${roleId}`);
  revalidatePath("/roles");
  revalidatePath("/candidates");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

/**
 * Bound to a specific roleId/applicationId/stage per button
 * (`changeStage.bind(null, roleId, application.id, "shortlisted")`) and
 * used directly as a `<form action={...}>` — no client component needed,
 * since there's no per-field input to validate or pending state beyond
 * what the browser's own form submission already shows. The bound args
 * come from this app's own JSX, not form input, so there's nothing here to
 * sanitize; requireCompanyPermission + setApplicationStage's
 * company-ownership check are what actually keep this safe.
 */
export async function changeStage(roleId: string, applicationId: string, stage: ApplicationStage): Promise<void> {
  const { companyId } = await requireCompanyPermission("candidate:stage");
  await setApplicationStage(companyId, applicationId, stage);
  revalidatePath(`/roles/${roleId}`);
  revalidatePath("/roles");
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${applicationId}`);
  revalidatePath("/dashboard");
}
