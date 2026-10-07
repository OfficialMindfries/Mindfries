import "server-only";
import { db } from "./supabase";
import { inviteSecret, signInviteToken } from "./auth/invite-token";
import { normalizeAssistantConfig } from "./assistant";
import { normalizeInterviewConfig } from "./interview";
import type {
  ApplicationStage,
  AssessmentReport,
  CandidateApplication,
  CandidateReport,
  CompanyBilling,
  CompanyRole,
  CompanyUser,
  DueCandidate,
  InterviewExchange,
  GameTemplate,
  JobRole,
  RoleStatus,
  RoleVisibility,
  SessionSummary,
  StageCounts,
} from "./types";

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

function toTemplate(r: any): GameTemplate {
  return {
    id: r.id,
    name: r.name,
    taskVariant: r.task_variant,
    techStack: r.tech_stack ?? [],
    durationMin: r.duration_min ?? 60,
  };
}

/** Only published templates — this portal picks from the shared library, it doesn't author rubrics/repo config (that stays in internal-admin). */
export async function listPublishedTemplates(): Promise<GameTemplate[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("game_templates")
    .select("*")
    .eq("status", "published")
    .order("name", { ascending: true });
  return (data ?? []).map(toTemplate);
}

function toJobRole(r: any): JobRole {
  return {
    id: r.id,
    companyId: r.company_id,
    templateId: r.template_id ?? null,
    templateName: r.game_templates?.name ?? null,
    title: r.title,
    techStack: r.tech_stack ?? [],
    durationMin: r.duration_min ?? null,
    visibility: r.visibility,
    status: r.status,
    createdAt: r.created_at,
    // Absent before migration 0014 has run; normalizing fills the defaults either way.
    interviewConfig: normalizeInterviewConfig(r.interview_config),
    // Absent before migration 0015 has run; same.
    assistantConfig: normalizeAssistantConfig(r.assistant_config),
  };
}

export async function listJobRoles(companyId: string): Promise<JobRole[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("job_roles")
    .select("*, game_templates(name)")
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
  const { data } = await c
    .from("job_roles")
    .select("*, game_templates(name)")
    .eq("company_id", companyId)
    .eq("id", roleId)
    .maybeSingle();
  return data ? toJobRole(data) : null;
}

/** IMPLEMENTATION.md §3.3/§3.7's deferred picker — attach (or detach, templateId=null) a published template after the role already exists. */
export async function setJobRoleTemplate(companyId: string, roleId: string, templateId: string | null): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c
    .from("job_roles")
    .update({ template_id: templateId })
    .eq("company_id", companyId)
    .eq("id", roleId);
  if (error) throw error;
}

/** Closes (or reopens) a role — same shape as setJobRoleTemplate. A closed role stops being this app's own concern beyond display; it doesn't retroactively touch any candidate already in its pipeline. */
export async function setJobRoleStatus(companyId: string, roleId: string, status: RoleStatus): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c
    .from("job_roles")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", roleId);
  if (error) throw error;
}

/**
 * Saves how the AI interview runs for a role. The value is normalized first,
 * so what's stored is always a complete, in-range config — the backend
 * normalizes again on read, but there's no reason to store junk.
 */
export async function setJobRoleInterview(companyId: string, roleId: string, config: unknown): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { data, error } = await c
    .from("job_roles")
    .update({ interview_config: normalizeInterviewConfig(config) })
    .eq("company_id", companyId)
    .eq("id", roleId)
    .select("id");
  // PGRST204 / 42703: the column isn't there yet — say what's actually wrong
  // instead of a raw Postgres message about a schema cache.
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    throw new Error("Interview settings aren't available yet — the database is missing migration 0014_interview_config.");
  }
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Role not found");
}

/**
 * Saves whether candidates for a role get the AI assistant and how many
 * messages they may send it. Normalized first, like the interview settings.
 */
export async function setJobRoleAssistant(companyId: string, roleId: string, config: unknown): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { data, error } = await c
    .from("job_roles")
    .update({ assistant_config: normalizeAssistantConfig(config) })
    .eq("company_id", companyId)
    .eq("id", roleId)
    .select("id");
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    throw new Error("Assistant settings aren't available yet — the database is missing migration 0015_assistant_config.");
  }
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Role not found");
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

/**
 * The bulk version of setApplicationStage — one query, not N. Scoped the
 * same way: the role must belong to this company, and the update itself is
 * pinned to `job_role_id = roleId`, so a crafted id for someone else's
 * candidate just doesn't match a row rather than silently touching it.
 */
export async function bulkSetApplicationStage(
  companyId: string,
  roleId: string,
  applicationIds: string[],
  stage: ApplicationStage,
): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  if (applicationIds.length === 0) return;
  const role = await getJobRole(companyId, roleId);
  if (!role) throw new Error("Role not found");
  const { error } = await c
    .from("candidate_applications")
    .update({ stage })
    .eq("job_role_id", roleId)
    .in("id", applicationIds);
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
  const empty: CandidateReport = { session: null, report: null, interview: [] };
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
  const interview = await getInterviewExchanges(session.id);
  if (!reportRow) return { session, report: null, interview };

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

  return { session, report, interview };
}

const RECORDINGS_BUCKET = "interview-recordings";
const RECORDING_LINK_SECONDS = 3600;
const NO_ANSWER_TEXT = "(no answer given in the time allowed)";

/**
 * Rebuilds the interview from the session's evidence trail: "interview"
 * events are the questions and answers, in order (written by
 * candidate/backend's orchestrator), and "interview_recording" events point
 * at the clip uploaded for each answer (written by candidate/frontend once
 * an upload succeeds). Recordings sit in a private bucket; each gets a
 * signed link valid for an hour.
 *
 * Returns [] on any failure — a missing transcript must not take the whole
 * report page down with it.
 */
async function getInterviewExchanges(sessionId: string): Promise<InterviewExchange[]> {
  const c = db();
  if (!c) return [];
  const { data, error } = await c
    .from("activity_events")
    .select("event_type, payload, occurred_at")
    .eq("session_id", sessionId)
    .in("event_type", ["interview", "interview_recording", "interview_recording_expired"])
    .order("occurred_at", { ascending: true });
  if (error || !data) return [];

  const exchanges: InterviewExchange[] = [];
  const clips = new Map<number, { path: string; kind: "audio" | "video"; seconds: number }>();
  // Recordings are deleted after 90 days (internal-admin's lib/retention.ts),
  // which leaves this event behind in place of the one pointing at the file.
  const expired = new Set<number>();
  for (const row of data) {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    if (row.event_type === "interview_recording_expired") {
      if (typeof p.question === "number") expired.add(p.question);
      continue;
    }
    if (row.event_type === "interview_recording") {
      if (typeof p.path === "string" && typeof p.question === "number" && p.path.startsWith(`${sessionId}/`)) {
        clips.set(p.question, { path: p.path, kind: p.kind === "video" ? "video" : "audio", seconds: Number(p.seconds) || 0 });
      }
      continue;
    }
    if (typeof p.text !== "string") continue;
    if (p.role === "interviewer") {
      exchanges.push({ number: exchanges.length + 1, question: p.text, answer: null, seconds: null, timedOut: false, unanswered: false, recording: null, recordingExpired: false });
    } else if (p.role === "candidate" && exchanges.length > 0) {
      const last = exchanges[exchanges.length - 1];
      last.answer = p.text;
      last.seconds = typeof p.seconds === "number" ? p.seconds : null;
      last.timedOut = p.timedOut === true;
      last.unanswered = p.text === NO_ANSWER_TEXT;
    }
  }

  await Promise.all(
    exchanges.map(async (x) => {
      const clip = clips.get(x.number);
      if (!clip) {
        x.recordingExpired = expired.has(x.number);
        return;
      }
      const { data: signed } = await c.storage.from(RECORDINGS_BUCKET).createSignedUrl(clip.path, RECORDING_LINK_SECONDS);
      if (signed?.signedUrl) x.recording = { url: signed.signedUrl, kind: clip.kind, seconds: clip.seconds };
    }),
  );
  return exchanges;
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

function toCompanyUser(r: any): CompanyUser {
  return {
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    name: r.name,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function listCompanyUsers(companyId: string): Promise<CompanyUser[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("company_users")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(toCompanyUser);
}

/**
 * IMPLEMENTATION.md Phase 4: invite a teammate. Same insert + sign-token
 * shape as internal-admin's private createCompanyUserInvite (which this
 * generalizes — `role` is a parameter here, not hardcoded "admin", since
 * that helper only ever provisions the founding admin). Returns `token:
 * null` if COMPANY_INVITE_SECRET isn't configured — the row still gets
 * created (the token can be re-derived by any future call once the secret
 * exists, since nothing about the row itself depends on it) — the caller
 * decides whether that's an error worth surfacing.
 */
export async function inviteCompanyUser(input: {
  companyId: string;
  email: string;
  name: string;
  role: CompanyRole;
}): Promise<{ companyUser: CompanyUser; token: string | null }> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");

  const { data, error } = await c
    .from("company_users")
    .insert({ company_id: input.companyId, email: input.email, name: input.name, role: input.role, status: "invited" })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Insert returned no row");

  const secret = inviteSecret();
  const token = secret ? await signInviteToken({ companyUserId: data.id, email: input.email }, secret) : null;
  return { companyUser: toCompanyUser(data), token };
}

export async function setCompanyUserStatus(
  companyId: string,
  userId: string,
  status: "active" | "disabled",
): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c
    .from("company_users")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", userId);
  if (error) throw error;
}

/** Changes an existing teammate's role. Same shape as setCompanyUserStatus — the "can't leave zero active admins" guard lives in the caller (settings/team/actions.ts's setTeammateRole), same as it already does for status changes. */
export async function setCompanyUserRole(companyId: string, userId: string, role: CompanyRole): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c
    .from("company_users")
    .update({ role })
    .eq("company_id", companyId)
    .eq("id", userId);
  if (error) throw error;
}

/**
 * IMPLEMENTATION.md §3.4: plan/seats straight from `companies`, usage
 * derived from the same counts Overview already reads (lib/overview.ts) —
 * no Stripe, no invented numbers, display only. `seatsUsed` counts active
 * company_users only — an invited-but-not-yet-accepted teammate isn't
 * occupying a seat yet.
 */
export async function getCompanyBilling(companyId: string): Promise<CompanyBilling> {
  const c = db();
  if (!c) return { plan: "trial", seatsTotal: 0, seatsUsed: 0, openRoles: 0, candidatesInvited: 0 };

  const { data: company } = await c.from("companies").select("plan, seats").eq("id", companyId).maybeSingle();
  const [roles, users, applications] = await Promise.all([
    listJobRoles(companyId),
    listCompanyUsers(companyId),
    listApplicationsForCompany(companyId),
  ]);

  return {
    plan: company?.plan ?? "trial",
    seatsTotal: company?.seats ?? 0,
    seatsUsed: users.filter((u) => u.status === "active").length,
    openRoles: roles.filter((r) => r.status === "open").length,
    candidatesInvited: applications.length,
  };
}
