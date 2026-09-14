"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  addOnboarded, addWaitlist, createCompany, createTemplate, recordEmailEvent, setCompanyStatus, setLeadStage,
  setSessionState, setTemplateStatus,
} from "@/lib/db";
import { sendMail, NOTIFY_EMAIL } from "@/lib/mailer";
import { targetsStore } from "@/lib/targets-store";
import { requireAdminRole } from "@/lib/auth/admins";
import type { EmailTemplate } from "@/lib/email-templates";
import type { CompanyStatus, LeadStage, MemberRole, Plan, RubricCriterion, TaskVariant, TemplateStatus } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// Send a demo/POC email to a lead, log it, advance the pipeline.
export async function sendLeadEmail(input: {
  leadId: string; template: EmailTemplate; to: string; subject: string; body: string;
}): Promise<Result> {
  try {
    await requireAdminRole();
    if (!input.to.trim()) throw new Error("No recipient email — fill in a contact address first");
    const id = await sendMail({ to: input.to, subject: input.subject, text: input.body, replyTo: NOTIFY_EMAIL });
    await recordEmailEvent({ leadId: input.leadId, type: "sent", template: input.template, resendId: id });
    revalidatePath("/admin/tracker");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changeLeadStage(leadId: string, stage: LeadStage): Promise<Result> {
  try {
    await requireAdminRole();
    await setLeadStage(leadId, stage);
    // A manual "mark replied" is also a tracked reply event.
    if (stage === "replied") await recordEmailEvent({ leadId, type: "replied" });
    revalidatePath("/admin/tracker");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Onboard a company as a user: generate a temp password, email the credentials,
// store the record (never the password), and mark the source lead onboarded.
export async function onboardCompany(input: {
  leadId?: string; company: string; adminEmail: string; plan: Plan; monthlyCost: number; targetId?: string;
}): Promise<Result> {
  try {
    await requireAdminRole();
    if (!input.company.trim() || !input.adminEmail.trim()) throw new Error("Company and admin email are required");
    const tempPassword = randomBytes(9).toString("base64url"); // ~12 chars, emailed once
    await sendMail({
      to: input.adminEmail,
      subject: `Your Mindfries workspace for ${input.company} is ready`,
      text:
`Welcome to Mindfries, ${input.company}!

Your workspace is live. Sign in at https://app.mindfries.com with:

  Email:    ${input.adminEmail}
  Password: ${tempPassword}

Please change your password after first login. Reply to this email if you need a hand.

— The Mindfries team`,
    });
    await addOnboarded({
      leadId: input.leadId, company: input.company, adminEmail: input.adminEmail,
      plan: input.plan, monthlyCost: input.monthlyCost,
    });
    // Came from a target: close the loop so it doesn't sit in "Pilot" forever.
    // Only after the email and the record both succeeded — a failed onboarding
    // must not mark anything won. A note, not a touch: it isn't contact with them.
    if (typeof input.targetId === "string" && input.targetId) {
      const store = targetsStore();
      if (await store.getTarget(input.targetId)) {
        await store.updateTarget(input.targetId, { stage: "won", nextAction: null, nextActionDue: null });
        await store.insertActivity({
          targetId: input.targetId, contactId: null, channel: "note", direction: null, outcome: null,
          summary: `Onboarded on the ${input.plan} plan — credentials sent to ${input.adminEmail}.`,
          happenedAt: new Date().toISOString(), by: null,
        });
        revalidatePath("/admin/targets");
        revalidatePath(`/admin/targets/${input.targetId}`);
      }
    }
    revalidatePath("/admin/onboarding");
    revalidatePath("/admin/costs");
    revalidatePath("/admin/tracker");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Author a game into the shared library (candidate app reads published ones).
export async function createGameTemplate(input: {
  name: string; taskVariant: TaskVariant; repoTemplate: string; techStack: string[];
  durationMin: number; interviewerPrompt: string; rubric: RubricCriterion[]; status: TemplateStatus;
}): Promise<Result> {
  try {
    await requireAdminRole();
    if (!input.name.trim()) throw new Error("Game name is required");
    await createTemplate(input);
    revalidatePath("/admin/library");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleTemplateStatus(id: string, status: TemplateStatus): Promise<Result> {
  try {
    await requireAdminRole();
    await setTemplateStatus(id, status);
    revalidatePath("/admin/library");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Company Onboarding, wired for real (ADMIN_BACKEND_PLAN.md §5.1) — this
// used to be a client component's local useState, persisting nothing.
export async function onboardCompanyAccount(input: {
  name: string; website: string; plan: Plan; status: CompanyStatus; seats: number;
  team: { email: string; role: MemberRole }[]; defaultTemplateIds: string[];
}): Promise<Result> {
  try {
    await requireAdminRole();
    if (!input.name.trim()) throw new Error("Company name is required");
    await createCompany(input);
    revalidatePath("/admin/companies");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCompanyStatusAction(id: string, status: CompanyStatus): Promise<Result> {
  try {
    await requireAdminRole();
    await setCompanyStatus(id, status);
    revalidatePath("/admin/companies");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Session Monitor support overrides.
export async function resetSession(id: string): Promise<Result> {
  try {
    await requireAdminRole();
    await setSessionState(id, { status: "live", sandboxHealth: "healthy", progressPct: 0, elapsedMin: 0 });
    revalidatePath("/admin/sessions");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function retriggerEval(id: string): Promise<Result> {
  try {
    await requireAdminRole();
    await setSessionState(id, { status: "evaluating" });
    revalidatePath("/admin/sessions");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Public waitlist form → store + ping the team inbox.
export async function joinWaitlist(input: {
  name?: string; email: string; company?: string; message?: string;
}): Promise<Result> {
  try {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new Error("Enter a valid email");
    await addWaitlist(input);
    try {
      await sendMail({
        to: NOTIFY_EMAIL,
        subject: `New Mindfries waitlist signup${input.company ? ` — ${input.company}` : ""}`,
        text: `${input.name ?? "Someone"} (${input.email})${input.company ? ` from ${input.company}` : ""} joined the waitlist.\n\n${input.message ?? ""}`,
      });
    } catch {
      // Notification is best-effort; the signup is already saved.
    }
    revalidatePath("/admin/waitlist");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
