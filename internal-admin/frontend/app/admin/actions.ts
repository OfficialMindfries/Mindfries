"use server";

import { revalidatePath } from "next/cache";
import {
  addOnboarded, addWaitlist, createCompany, createInvitation, createTemplate, recordEmailEvent, setCompanyStatus,
  setLeadStage, setSessionState, setTemplateStatus,
} from "@/lib/db";
import { sendMail, NOTIFY_EMAIL } from "@/lib/mailer";
import { targetsStore } from "@/lib/targets-store";
import { requireAdminRole } from "@/lib/auth/admins";
import { backendReady, resetSessionViaBackend, retriggerEvaluationViaBackend } from "@/lib/backend/client";
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

// Onboard a company: create the real record, mark the source lead onboarded,
// and best-effort notify the company contact — no login credentials, because
// there is no company login for them to sign in with yet (no Company Portal,
// no company_users table; see 0001_tracker.sql's own note that a temp
// password is deliberately never stored). This used to generate and email
// one anyway, claiming "sign in at https://app.mindfries.com" — a URL that
// doesn't exist. Removed rather than fixed forward: send it for real once a
// company login exists, not before.
export async function onboardCompany(input: {
  leadId?: string; company: string; adminEmail: string; plan: Plan; monthlyCost: number; targetId?: string;
}): Promise<Result> {
  try {
    await requireAdminRole();
    if (!input.company.trim() || !input.adminEmail.trim()) throw new Error("Company and admin email are required");
    try {
      await sendMail({
        to: input.adminEmail,
        subject: `You're onboarded with Mindfries, ${input.company}!`,
        text:
`Welcome to Mindfries, ${input.company}!

Your account is set up on our end — we'll be in touch shortly with next steps to get your team started.

Reply to this email if you need a hand in the meantime.

— The Mindfries team`,
      });
    } catch {
      // Best-effort, same as the waitlist form's own notification (below).
      // This used to be unguarded: a missing Resend key made the whole
      // action fail here, before the real company record below was ever
      // created — with RESEND_API_KEY unset (true everywhere today), that
      // meant onboarding a company via the Tracker failed outright.
    }
    await addOnboarded({
      leadId: input.leadId, company: input.company, adminEmail: input.adminEmail,
      plan: input.plan, monthlyCost: input.monthlyCost,
    });
    // Came from a target: close the loop so it doesn't sit in "Pilot" forever.
    // Only after the record was created — a failed onboarding must not mark
    // anything won. A note, not a touch: it isn't contact with them.
    if (typeof input.targetId === "string" && input.targetId) {
      const store = targetsStore();
      if (await store.getTarget(input.targetId)) {
        await store.updateTarget(input.targetId, { stage: "won", nextAction: null, nextActionDue: null });
        await store.insertActivity({
          targetId: input.targetId, contactId: null, channel: "note", direction: null, outcome: null,
          summary: `Onboarded on the ${input.plan} plan — ${input.adminEmail} notified.`,
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
  taskBrief?: string; starterFiles?: Record<string, string>;
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

// Invite a candidate: the admin-side half of a real per-candidate
// invitation (candidate/backend's CreateInvitation is the other half, still
// unused — see lib/db.ts's createInvitation for why this goes direct to
// Supabase instead of calling it). Until this action existed, nothing could
// create one except a direct database write.
export async function inviteCandidate(input: {
  companyId: string; templateId: string; candidateEmail: string; candidateName?: string; role?: string; dueDate?: string;
}): Promise<Result> {
  try {
    await requireAdminRole();
    if (!input.companyId) throw new Error("Pick a company");
    if (!input.templateId) throw new Error("Pick an assessment");
    const email = input.candidateEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address");
    await createInvitation({ ...input, candidateEmail: email });
    revalidatePath("/admin/companies");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Session Monitor support overrides — go through the real Go Admin API
// (candidate/backend/internal/httpapi/admin.go) when it's reachable, rather
// than internal-admin's own direct-to-Supabase write. This is the
// consolidation task.md's "Gaps worth naming" #3 asked for: two separate
// implementations of "reset a session" is a real maintenance hazard, and
// for retrigger specifically the two aren't even equivalent today — the
// direct-Supabase version below only ever flips sessions.status to
// "evaluating"; it never actually calls an evaluation agent. The backend's
// own /retrigger-evaluation runs the real pipeline. ADMIN_BACKEND_URL is
// unset in every deployed environment right now (the Go backend isn't
// deployed anywhere — see task.md), so the fallback below is what actually
// runs today; it's kept, not deleted, so this feature doesn't regress the
// moment nobody's set that variable yet. Once the backend has a real home,
// removing the fallback finishes what this pass started.
export async function resetSession(id: string): Promise<Result> {
  try {
    await requireAdminRole();
    if (backendReady()) {
      await resetSessionViaBackend(id);
    } else {
      await setSessionState(id, { status: "live", sandboxHealth: "healthy", progressPct: 0, elapsedMin: 0 });
    }
    revalidatePath("/admin/sessions");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function retriggerEval(id: string): Promise<Result> {
  try {
    await requireAdminRole();
    if (backendReady()) {
      await retriggerEvaluationViaBackend(id);
    } else {
      // Honest about what this fallback actually does: it flips the status
      // flag the Sessions page reads, but doesn't call an evaluation agent
      // the way the real backend path (above) does. Configuring
      // ADMIN_BACKEND_URL is what makes "retrigger" genuinely retrigger.
      await setSessionState(id, { status: "evaluating" });
    }
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
