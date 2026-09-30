import "server-only";
import { db } from "./supabase";
import type { ApplicationStage, AssessmentReport, CandidateApplication, CandidateReport, DueCandidate, JobRole, RoleVisibility, SessionSummary, StageCounts } from "./types";

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

/**
 * Moves a candidate to a new pipeline stage — Phase 2's per-candidate
 * version of the original plan's "bulk actions"; a multi-select bulk-action
 * bar is still outstanding, this is one candidate at a time. Scoped through
 * job_roles the same way every other write here is, so a request can't move
 * a candidate that belongs to a different company's role.
 */
export async function setApplicationStage(companyId: string, applicationId: string, stage: ApplicationStage): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const existing = await getApplicationForCompany(companyId, applicationId);
  if (!existing) throw new Error("Candidate not found");
  const { error } = await c.from("candidate_applications").update({ stage }).eq("id", applicationId);
  if (error) throw error;
}

/** One candidate's detail page — scoped through job_roles so one company can never open another's candidate by id. */
export async function getApplicationForCompany(companyId: string, applicationId: string): Promise<CandidateApplicationWithRole | null> {
  const c = db();
  if (!c) return null;
  const { data } = await c
    .from("candidate_applications")
    .select("*, job_roles!inner(id, title, company_id)")
    .eq("id", applicationId)
    .eq("job_roles.company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  return { ...toApplication(data), roleTitle: (data as any).job_roles?.title ?? "—" };
}

/**
 * Reads the session and evidence-based report for a candidate's assessment
 * — direct Supabase reads of the shared `sessions` / `assessment_reports` /
 * `evidence_items` tables, not a call to candidate/backend's Go API (see
 * lib/types.ts's CandidateReport for why: that API authenticates by
 * forwarding the *candidate's own* session cookie, which this app never
 * has). Returns nulls rather than throwing when nothing exists yet — a
 * candidate who hasn't started, or whose report hasn't been generated, is
 * an honest empty state, not an error.
 */
export async function getCandidateReport(assessmentId: string | null): Promise<CandidateReport> {
  const empty: CandidateReport = { session: null, report: null };
  if (!assessmentId) return empty;
  const c = db();
  if (!c) return empty;

  const { data: sessionRow } = await c
    .from("sessions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sessionRow) return empty;

  const session: SessionSummary = {
    id: sessionRow.id,
    status: sessionRow.status,
    sandboxHealth: sessionRow.sandbox_health,
    progressPct: sessionRow.progress_pct ?? 0,
    durationMin: sessionRow.duration_min ?? 60,
    elapsedMin: sessionRow.elapsed_min ?? 0,
    startedAt: sessionRow.started_at,
  };

  const { data: reportRow } = await c.from("assessment_reports").select("*").eq("session_id", session.id).maybeSingle();
  if (!reportRow) return { session, report: null };

  const { data: evidenceRows } = await c
    .from("evidence_items")
    .select("*")
    .eq("report_id", reportRow.id)
    .order("created_at", { ascending: true });

  const report: AssessmentReport = {
    id: reportRow.id,
    status: reportRow.status,
    recommendation: reportRow.recommendation ?? null,
    summary: reportRow.summary ?? null,
    error: reportRow.error ?? null,
    evidence: (evidenceRows ?? []).map((e: any) => ({ id: e.id, category: e.category, observation: e.observation })),
  };

  return { session, report };
}

/**
 * Every candidate with a real due date on their assessment — the Overview
 * calendar widget's data. `assessments.due_date` is set at invite time
 * (inviteCandidateToRole passes it straight through); joined here rather
 * than added to candidate_applications, since the due date belongs to the
 * assessment record, not the pipeline row. Sorted in JS rather than via a
 * nested-column `.order()` — small volumes at MVP scale, and Supabase's
 * embedded-resource ordering only reliably covers the base table's own
 * columns.
 */
export async function listUpcomingDueDates(companyId: string): Promise<DueCandidate[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("candidate_applications")
    .select("id, candidate_name, candidate_email, job_roles!inner(title, company_id), assessments!inner(due_date)")
    .eq("job_roles.company_id", companyId)
    .not("assessments.due_date", "is", null);

  return (data ?? [])
    .map((r: any) => ({
      applicationId: r.id,
      candidateName: r.candidate_name ?? null,
      candidateEmail: r.candidate_email,
      roleTitle: r.job_roles?.title ?? "—",
      dueDate: r.assessments?.due_date as string,
    }))
    .filter((d) => !!d.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
