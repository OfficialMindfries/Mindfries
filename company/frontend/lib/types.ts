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
