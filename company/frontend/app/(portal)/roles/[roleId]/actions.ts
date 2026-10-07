"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireCompanyPermission } from "@/lib/auth/company-users";
import { bulkSetApplicationStage, createCompanyTemplate, getJobRole, inviteCandidateToRole, setApplicationStage, setJobRoleAssistant, setJobRoleInterview, setJobRoleStatus, setJobRoleTemplate } from "@/lib/db";
import type { ApplicationStage } from "@/lib/types";
import { generateTask, parseCodeSample, taskGenerationReady, type GeneratedTask } from "@/lib/task-generation";

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

/**
 * Bound to a specific roleId/stage via the bulk-action bar's own
 * `formAction={bulkChangeStage.bind(null, roleId, "shortlisted")}` — one
 * submit button per stage, same as changeStage. Unlike changeStage, the ids
 * to move aren't bound ahead of time: they're whichever checkboxes were
 * checked, read from the real submitted FormData (name="applicationIds",
 * repeated once per checked row).
 */
export async function bulkChangeStage(roleId: string, stage: ApplicationStage, formData: FormData): Promise<void> {
  const { companyId } = await requireCompanyPermission("candidate:stage");
  const applicationIds = formData.getAll("applicationIds").map(String).filter(Boolean);
  if (applicationIds.length === 0) return;
  await bulkSetApplicationStage(companyId, roleId, applicationIds, stage);
  revalidatePath(`/roles/${roleId}`);
  revalidatePath("/roles");
  revalidatePath("/candidates");
  revalidatePath("/dashboard");
}

export type AttachTemplateState = { error: string | null; success: boolean };

/** IMPLEMENTATION.md §3.3/§3.7's deferred picker, wired in now: attach or detach (empty selection) a published assessment template on an existing role. */
export async function attachTemplate(roleId: string, _prev: AttachTemplateState, form: FormData): Promise<AttachTemplateState> {
  let companyId: string;
  try {
    companyId = (await requireCompanyPermission("role:write")).companyId;
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }
  const templateId = String(form.get("templateId") ?? "").trim() || null;
  try {
    await setJobRoleTemplate(companyId, roleId, templateId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update the assessment — try again.", success: false };
  }
  revalidatePath(`/roles/${roleId}`);
  revalidatePath("/roles");
  return { error: null, success: true };
}

export type InterviewSettingsState = { error: string | null; success: boolean };

/**
 * Saves the role's AI interview settings. The form's values arrive as
 * strings; setJobRoleInterview normalizes them against the allowed ranges,
 * so a tampered form can't store an interview with a thousand questions.
 */
export async function saveInterviewSettings(roleId: string, _prev: InterviewSettingsState, form: FormData): Promise<InterviewSettingsState> {
  let companyId: string;
  try {
    companyId = (await requireCompanyPermission("role:write")).companyId;
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }
  try {
    await setJobRoleInterview(companyId, roleId, {
      questions: Number(form.get("questions")),
      answerSeconds: Number(form.get("answerSeconds")),
      tone: String(form.get("tone") ?? ""),
      language: String(form.get("language") ?? ""),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the interview settings — try again.", success: false };
  }
  revalidatePath(`/roles/${roleId}`);
  return { error: null, success: true };
}

const TASK_TYPES = new Set(["bug_fix", "feature", "refactor", "debug"]);

/**
 * Drafts a task for this role from the company's own material. Returns the
 * draft to the page, with what running it found — nothing is saved here.
 */
export async function generateRoleTask(roleId: string, form: FormData): Promise<{ ok: true; task: GeneratedTask } | { ok: false; error: string }> {
  try {
    const user = await requireCompanyPermission("role:write");
    const role = await getJobRole(user.companyId, roleId);
    if (!role) return { ok: false, error: "Role not found." };
    if (!taskGenerationReady()) return { ok: false, error: "Task generation isn't connected for this portal yet. You can still attach a task from the library." };

    const name = text(form.get("name"), 120);
    const jobDescription = text(form.get("jobDescription"), 12000);
    const notes = text(form.get("notes"), 4000);
    if (!name) return { ok: false, error: "Give the task a name." };
    if (!jobDescription && !notes) return { ok: false, error: "Paste the job description, or say what the task should reflect." };
    const taskVariant = String(form.get("taskVariant") ?? "");
    const stack = text(form.get("techStack"), 200);

    const task = await generateTask({
      name,
      taskVariant: TASK_TYPES.has(taskVariant) ? taskVariant : "bug_fix",
      techStack: stack ? stack.split(",").map((s) => s.trim()).filter(Boolean) : role.techStack,
      durationMin: Number(form.get("durationMin")) || role.durationMin || 60,
      notes: `Company: ${user.companyName}. Role: ${role.title}.${notes ? ` ${notes}` : ""}`,
      jobDescription,
      codebase: parseCodeSample(typeof form.get("codebase") === "string" ? (form.get("codebase") as string).slice(0, 60000) : ""),
    });
    return { ok: true, task };
  } catch (e) {
    return { ok: false, error: e instanceof ForbiddenError ? e.message : e instanceof Error ? e.message : "Couldn't generate a task — try again." };
  }
}

/** Saves a draft from generateRoleTask as the company's own task and attaches it to the role. */
export async function saveGeneratedTask(roleId: string, input: { name: string; taskVariant: string; task: GeneratedTask }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireCompanyPermission("role:write");
    const role = await getJobRole(user.companyId, roleId);
    if (!role) return { ok: false, error: "Role not found." };
    const name = text(input.name, 120);
    const task = input.task;
    // The draft has been to the browser and back, so it is checked like any
    // other input rather than trusted as what the model returned.
    const files = (v: unknown): Record<string, string> =>
      v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, c]) => typeof c === "string").slice(0, 40)) as Record<string, string> : {};
    const starterFiles = files(task?.starterFiles);
    if (!name || typeof task?.taskBrief !== "string" || !task.taskBrief.trim() || Object.keys(starterFiles).length === 0) {
      return { ok: false, error: "That draft is incomplete — generate it again." };
    }
    const size = JSON.stringify(task).length;
    if (size > 600_000) return { ok: false, error: "That task is too large to save." };

    await createCompanyTemplate(user.companyId, roleId, {
      name,
      taskVariant: TASK_TYPES.has(input.taskVariant) ? input.taskVariant : "bug_fix",
      techStack: role.techStack,
      durationMin: role.durationMin ?? 60,
      taskBrief: task.taskBrief.slice(0, 20000),
      starterFiles,
      solutionFiles: files(task.solutionFiles),
      verification: task.verification ?? null,
    });
    revalidatePath(`/roles/${roleId}`);
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ForbiddenError ? e.message : e instanceof Error ? e.message : "Couldn't save the task — try again." };
  }
}

export type AssistantSettingsState = { error: string | null; success: boolean };

/**
 * Saves the role's AI assistant settings. setJobRoleAssistant normalizes the
 * values against the allowed range, so a tampered form can't raise the
 * message limit past the platform's own.
 */
export async function saveAssistantSettings(roleId: string, _prev: AssistantSettingsState, form: FormData): Promise<AssistantSettingsState> {
  let companyId: string;
  try {
    companyId = (await requireCompanyPermission("role:write")).companyId;
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }
  try {
    await setJobRoleAssistant(companyId, roleId, {
      enabled: form.get("enabled") !== "off",
      maxMessages: Number(form.get("maxMessages")),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the assistant settings — try again.", success: false };
  }
  revalidatePath(`/roles/${roleId}`);
  return { error: null, success: true };
}

export type SetRoleStatusState = { error: string | null; success: boolean };

/**
 * Bound to a specific roleId + target status (`setRoleStatus.bind(null,
 * roleId, "closed")`), same pattern as attachTemplate — no form fields of
 * its own, the target status is already decided by which button was
 * clicked (open → "Close role", closed → "Reopen role").
 */
export async function setRoleStatus(
  roleId: string,
  status: "open" | "closed",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: SetRoleStatusState,
): Promise<SetRoleStatusState> {
  let companyId: string;
  try {
    companyId = (await requireCompanyPermission("role:write")).companyId;
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in.", success: false };
  }
  try {
    await setJobRoleStatus(companyId, roleId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update that role — try again.", success: false };
  }
  revalidatePath(`/roles/${roleId}`);
  revalidatePath("/roles");
  return { error: null, success: true };
}
