"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireCompanyPermission } from "@/lib/auth/company-users";
import { inviteCompanyUser, listCompanyUsers, setCompanyUserStatus } from "@/lib/db";
import { mailerReady, sendMail } from "@/lib/mailer";
import type { CompanyRole } from "@/lib/types";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES: CompanyRole[] = ["admin", "recruiter", "viewer"];

export type InviteTeammateState = { error: string | null; success: boolean; warning?: string };

/**
 * Same shape as internal-admin's onboardCompany: create the company_users
 * row + mint the invite token first, then decide whether an email claiming
 * a working sign-in link is honest to send (COMPANY_PORTAL_URL and the
 * mailer both need to be configured) — falling back to a "saved, share it
 * yourself" warning rather than silently pretending an email went out.
 */
export async function inviteTeammate(_prev: InviteTeammateState, form: FormData): Promise<InviteTeammateState> {
  let session;
  try {
    session = await requireCompanyPermission("team:manage");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }

  const email = text(form.get("email"), 254).toLowerCase();
  const name = text(form.get("name"), 200);
  const role = text(form.get("role"), 20) as CompanyRole;
  if (!EMAIL_RE.test(email)) return { error: "That doesn't look like an email address.", success: false };
  if (!name) return { error: "Name is required.", success: false };
  if (!ROLES.includes(role)) return { error: "Pick a role.", success: false };

  const existing = await listCompanyUsers(session.companyId);
  if (existing.some((u) => u.email.toLowerCase() === email)) {
    return { error: "That person is already on the team.", success: false };
  }

  let token: string | null;
  try {
    const result = await inviteCompanyUser({ companyId: session.companyId, email, name, role });
    token = result.token;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't invite that person — try again.", success: false };
  }

  revalidatePath("/settings/team");

  const portalUrl = process.env.COMPANY_PORTAL_URL;
  if (!mailerReady() || !token || !portalUrl) {
    return {
      error: null,
      success: true,
      warning: "Invite saved, but email isn't configured yet — share a sign-in link with them directly.",
    };
  }
  try {
    await sendMail({
      to: email,
      subject: `You've been added to ${session.companyName}'s Mindfries workspace`,
      text: `${session.name} added you to ${session.companyName}'s Mindfries workspace as ${role}.

Set your password to sign in:

${portalUrl}/set-password?token=${token}

This link expires in 7 days.

— The Mindfries team`,
    });
  } catch {
    return { error: null, success: true, warning: "Invite saved, but the notification email failed to send — share the link with them directly." };
  }

  return { error: null, success: true };
}

export type SetStatusState = { error: string | null; success: boolean };

/**
 * Bound to a specific userId + target status in the client
 * (`setTeammateStatus.bind(null, userId, status)`), same pattern as
 * attachTemplate/changeStage. Blocks disabling yourself and disabling
 * the last active admin.
 */
export async function setTeammateStatus(
  userId: string,
  status: "active" | "disabled",
  // No form fields — everything needed is already bound. useActionState
  // still calls this as (prevState, formData); the trailing formData
  // argument is simply never declared here rather than named-and-unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: SetStatusState,
): Promise<SetStatusState> {
  let session;
  try {
    session = await requireCompanyPermission("team:manage");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }

  const existing = await listCompanyUsers(session.companyId);
  const target = existing.find((u) => u.id === userId);
  if (!target) return { error: "That person isn't on the team.", success: false };

  if (status === "disabled") {
    if (target.email.toLowerCase() === session.email.toLowerCase()) {
      return { error: "You can't disable yourself.", success: false };
    }
    const remainingActiveAdmins = existing.filter(
      (u) => u.role === "admin" && u.status === "active" && u.id !== userId,
    ).length;
    if (target.role === "admin" && target.status === "active" && remainingActiveAdmins === 0) {
      return { error: "Can't disable the last active admin.", success: false };
    }
  }

  try {
    await setCompanyUserStatus(session.companyId, userId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update that — try again.", success: false };
  }

  revalidatePath("/settings/team");
  return { error: null, success: true };
}
