import type { AssistantConfig } from "@/lib/assistant";
import type { Moment } from "@/lib/moments";
import type { InterviewConfig } from "@/lib/interview";

// Domain model for the Company Portal (IMPLEMENTATION.md §7).

export type CompanyRole = "admin" | "recruiter" | "viewer";
export type CompanyUserStatus = "invited" | "active" | "disabled";

export interface CompanyUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: CompanyRole;
  status: CompanyUserStatus;
  createdAt: string;
}

export type RoleVisibility = "invite_only" | "open_pool";
export type RoleStatus = "open" | "closed";

// The shared Assessment/Game Library — authored by Mindfries ops in
// internal-admin; a role can attach one of the published ones (§3.3/§3.7).
export type TaskVariant = "bug_fix" | "feature" | "refactor" | "debug";

export interface GameTemplate {
  id: string;
  name: string;
  taskVariant: TaskVariant;
  techStack: string[];
  durationMin: number;
}

export interface JobRole {
  id: string;
  companyId: string;
  templateId: string | null;
  templateName: string | null;
  title: string;
  techStack: string[];
  durationMin: number | null;
  visibility: RoleVisibility;
  status: RoleStatus;
  createdAt: string;
  /** How the AI interview runs for this role — always complete, defaults filled in. */
  interviewConfig: InterviewConfig;
  /** Whether candidates for this role get the AI assistant, and its message limit — always complete. */
  assistantConfig: AssistantConfig;
}

export type ApplicationStage =
  | "invited"
  | "in_progress"
  | "completed"
  | "shortlisted"
  | "rejected"
  | "hired";

export interface CandidateApplication {
  id: string;
  jobRoleId: string;
  assessmentId: string | null;
  candidateName: string | null;
  candidateEmail: string;
  stage: ApplicationStage;
  score: number | null;
  sectionScores: Record<string, number>;
  timeTakenMin: number | null;
  completedAt: string | null;
  createdAt: string;
}

/** One role's pipeline at a glance — IMPLEMENTATION.md §9. */
export type StageCounts = Record<ApplicationStage, number>;

// The evidence-based report — read directly from the shared `sessions` /
// `assessment_reports` / `evidence_items` tables (0002/0006 migrations),
// not through candidate/backend's Go API: that API's
// GET /api/v1/sessions/{id}/report forwards the *candidate's own* signed
// cookie for the Go backend to verify (see candidate/frontend's
// lib/backend/client.ts) — a company session has no such cookie to
// forward. Reading the same tables this app's own service-role Supabase
// client already has access to is the direct-CRUD pattern every other read
// in this codebase follows (ARCHITECTURE.md: "reads go straight to
// Supabase from each Next app's server layer").

export interface SessionSummary {
  id: string;
  status: string;
  sandboxHealth: string;
  progressPct: number;
  durationMin: number;
  elapsedMin: number;
  startedAt: string;
}

export interface EvidenceItem {
  id: string;
  category: string;
  observation: string;
}

export type ReportStatus = "pending" | "generating" | "ready" | "failed";

export interface AssessmentReport {
  id: string;
  status: ReportStatus;
  recommendation: string | null;
  summary: string | null;
  error: string | null;
  evidence: EvidenceItem[];
  /** The session moments the evidence cites ("[E<id>]" in an observation). */
  moments: Moment[];
  /** Notes and corrections a reviewer has added, oldest first. */
  annotations: ReportAnnotation[];
  /** The reviewer's own decision, when one has been recorded. */
  review: ReportReview | null;
}

/** A reviewer's note against the report, or one section of it. Never shown to the candidate. */
export interface ReportAnnotation {
  id: string;
  /** The evidence category it is about; null for the report as a whole. */
  category: string | null;
  kind: "note" | "correction";
  body: string;
  authorName: string;
  createdAt: string;
}

/** A person's decision, recorded beside the AI's recommendation rather than over it. */
export interface ReportReview {
  recommendation: string | null;
  note: string | null;
  by: string | null;
  at: string | null;
}

/** One question of the AI follow-up interview, with what came back. */
export interface InterviewExchange {
  /** 1-based position in the interview. */
  number: number;
  question: string;
  /** null when the interview ended with this question still waiting. */
  answer: string | null;
  /** Seconds the candidate took, measured by the backend. null when unknown or unanswered. */
  seconds: number | null;
  /** The answer ran past the role's time limit. */
  timedOut: boolean;
  /** The time ran out with nothing said at all. */
  unanswered: boolean;
  /** The candidate's recorded answer, when one was uploaded. `url` is signed and short-lived. */
  recording: { url: string; kind: "audio" | "video"; seconds: number } | null;
  /** There was a recording, and it has been deleted at the end of its 90-day retention. */
  recordingExpired: boolean;
}

export interface CandidateReport {
  session: SessionSummary | null;
  report: AssessmentReport | null;
  /** The interview as it happened. Empty when none took place. */
  interview: InterviewExchange[];
}

/** A candidate whose assessment has a real due date — the Overview calendar widget. */
export interface DueCandidate {
  applicationId: string;
  candidateName: string | null;
  candidateEmail: string;
  roleTitle: string;
  dueDate: string; // YYYY-MM-DD
}

/** §3.4's billing page: plan/seats straight from `companies`, usage derived from existing counts — no Stripe, no invented numbers. */
export interface CompanyBilling {
  plan: string;
  seatsTotal: number;
  seatsUsed: number;
  openRoles: number;
  candidatesInvited: number;
}
