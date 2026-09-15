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

export interface JobRole {
  id: string;
  companyId: string;
  templateId: string | null;
  title: string;
  techStack: string[];
  durationMin: number | null;
  visibility: RoleVisibility;
  status: RoleStatus;
  createdAt: string;
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
}

export interface CandidateReport {
  session: SessionSummary | null;
  report: AssessmentReport | null;
}
