import "server-only";
import { db } from "./supabase";
import type { CandidateApplication, JobRole, RoleVisibility, StageCounts } from "./types";

// Data access for the Company Portal. Every read returns [] when Supabase
// isn't wired yet, so pages render empty states instead of crashing
// pre-setup — same convention as candidate/frontend and internal-admin's
// own lib/db.ts.
//
// Every function here takes companyId explicitly and every caller must pass
// it from the signed-in session (lib/auth/company-users.ts's
// currentCompanyUser()), never from a client-supplied value — that's what
// keeps one company's roles and candidates from ever being reachable by
// another's session.

/* eslint-disable @typescript-eslint/no-explicit-any */

function toJobRole(r: any): JobRole {
  return {
    id: r.id,
    companyId: r.company_id,
    templateId: r.template_id ?? null,
    title: r.title,
    techStack: r.tech_stack ?? [],
    durationMin: r.duration_min ?? null,
    visibility: r.visibility,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function listJobRoles(companyId: string): Promise<JobRole[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("job_roles")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toJobRole);
}

/**
 * Creates a role with no assessment attached (template_id stays null) —
 * per this session's scope call, a company can open a role now and the
 * assessment-template picker (IMPLEMENTATION.md §3.3) is a separate,
 * later integration, not a precondition for this to work.
 */
export async function createJobRole(input: {
  companyId: string;
  title: string;
  techStack: string[];
  durationMin: number | null;
  visibility: RoleVisibility;
}): Promise<JobRole> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { data, error } = await c
    .from("job_roles")
    .insert({
      company_id: input.companyId,
      title: input.title,
      tech_stack: input.techStack,
      duration_min: input.durationMin,
      visibility: input.visibility,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Insert returned no row");
  return toJobRole(data);
}

export async function getJobRole(companyId: string, roleId: string): Promise<JobRole | null> {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("job_roles").select("*").eq("company_id", companyId).eq("id", roleId).maybeSingle();
  return data ? toJobRole(data) : null;
}

const EMPTY_STAGE_COUNTS: StageCounts = {
  invited: 0,
  in_progress: 0,
  completed: 0,
  shortlisted: 0,
  rejected: 0,
  hired: 0,
};

/** Per-role pipeline stage counts (IMPLEMENTATION.md §9) — one query per role for now; fine at MVP volumes. */
export async function stageCountsForRole(roleId: string): Promise<StageCounts> {
  const c = db();
  if (!c) return { ...EMPTY_STAGE_COUNTS };
  const { data } = await c.from("candidate_applications").select("stage").eq("job_role_id", roleId);
  const counts = { ...EMPTY_STAGE_COUNTS };
  for (const row of data ?? []) {
    const stage = row.stage as keyof StageCounts;
    if (stage in counts) counts[stage] += 1;
  }
  return counts;
}

function toApplication(r: any): CandidateApplication {
  return {
    id: r.id,
    jobRoleId: r.job_role_id,
    assessmentId: r.assessment_id ?? null,
    candidateName: r.candidate_name ?? null,
    candidateEmail: r.candidate_email,
    stage: r.stage,
    score: r.score ?? null,
    sectionScores: r.section_scores ?? {},
    timeTakenMin: r.time_taken_min ?? null,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at,
  };
}

export async function listApplicationsForRole(roleId: string): Promise<CandidateApplication[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("candidate_applications")
    .select("*")
    .eq("job_role_id", roleId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toApplication);
}

/**
 * Invites a candidate to a role. Writes a real `assessments` row first —
 * the same table internal-admin's own createInvitation (and
 * candidate/backend's Go CreateInvitation) write to, so the candidate
 * app's existing session/report lifecycle picks this up unchanged — then a
 * linked `candidate_applications` row for this app's own pipeline board.
 * `assessments.template_id` carries over from the role's own template_id,
 * which is null until that picker is built (IMPLEMENTATION.md §3.7) — an
 * invite works either way, matching how `assessments.template_id` has
 * always been nullable.
 *
 * Not a single transaction — Supabase's client doesn't expose one across
 * two tables here, the same tradeoff internal-admin's addOnboarded
 * accepts — ordered so a failure on the second insert leaves an
 * `assessments` row unlinked rather than the invite silently not
 * happening at all.
 */
export async function inviteCandidateToRole(input: {
  companyId: string;
  jobRoleId: string;
  candidateEmail: string;
  candidateName?: string;
  dueDate?: string;
}): Promise<CandidateApplication> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");

  const role = await getJobRole(input.companyId, input.jobRoleId);
  if (!role) throw new Error("Role not found");

  const { data: assessment, error: assessmentError } = await c
    .from("assessments")
    .insert({
      company_id: input.companyId,
      template_id: role.templateId,
      candidate_email: input.candidateEmail,
      candidate_name: input.candidateName || null,
      role: role.title,
      due_date: input.dueDate || null,
    })
    .select("id")
    .single();
  if (assessmentError || !assessment) throw assessmentError ?? new Error("Insert returned no row");

  const { data, error } = await c
    .from("candidate_applications")
    .insert({
      job_role_id: input.jobRoleId,
      assessment_id: assessment.id,
      candidate_email: input.candidateEmail,
      candidate_name: input.candidateName || null,
      stage: "invited",
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Insert returned no row");
  return toApplication(data);
}

export interface CandidateApplicationWithRole extends CandidateApplication {
  roleTitle: string;
}

/** Cross-role candidate list (§4's "All candidates" screen) — filtered through job_roles so one company never sees another's rows. */
export async function listApplicationsForCompany(companyId: string): Promise<CandidateApplicationWithRole[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("candidate_applications")
    .select("*, job_roles!inner(id, title, company_id)")
    .eq("job_roles.company_id", companyId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({ ...toApplication(r), roleTitle: r.job_roles?.title ?? "—" }));
}
