// Domain model for the Mindfries Internal Admin Portal (PRD §1.10, §1.11).
// MVP surfaces: Company Onboarding, Assessment/Game Library, Global Session Monitor.

export type Plan = "trial" | "starter" | "growth" | "enterprise";
export type CompanyStatus = "onboarding" | "active" | "paused";
export type MemberRole = "admin" | "hiring_manager" | "reviewer";

export interface TeamMember {
  id: string;
  email: string;
  role: MemberRole;
}

export interface Company {
  id: string;
  name: string;
  website: string;
  plan: Plan;
  status: CompanyStatus;
  seats: number;
  team: TeamMember[];
  defaultTemplateIds: string[];
  createdAt: string; // ISO date
}

export type TaskVariant = "bug_fix" | "feature" | "refactor" | "debug";
export type TemplateStatus = "draft" | "published";

export interface RubricCriterion {
  id: string;
  label: string;
  weight: number; // percent
}

// A "game" in the shared Assessment/Game Library, authored by Mindfries Ops
// and selected/lightly customised by companies (PRD §1.11).
export interface GameTemplate {
  id: string;
  name: string;
  taskVariant: TaskVariant;
  repoTemplate: string; // e.g. "node-express-api"
  techStack: string[];
  durationMin: number;
  interviewerPrompt: string;
  rubric: RubricCriterion[];
  status: TemplateStatus;
  usedByCompanies: number;
  createdAt: string;
}

// ── Lead Tracker (outbound growth pipeline) ─────────────────────────────────
// A company found by the daily crawler, moving through the sales funnel.
export type LeadStage =
  | "new"
  | "emailed"
  | "replied"
  | "demo"
  | "poc"
  | "onboarded"
  | "rejected";

export interface Lead {
  id: string;
  company: string;
  domain: string | null;
  contactEmail: string | null;
  source: string;
  sourceUrl: string | null;
  roleTitle: string | null;
  location: string | null;
  tags: string[];
  score: number; // 0..100 ICP fit
  stage: LeadStage;
  lastEmailedAt: string | null;
  createdAt: string;
  // Aggregated from email_events (server-computed), optional on read.
  emailedCount?: number;
  openedCount?: number;
  repliedCount?: number;
}

export interface WaitlistEntry {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  message: string | null;
  createdAt: string;
}

export interface OnboardedCompany {
  id: string;
  company: string;
  adminEmail: string;
  plan: Plan;
  monthlyCost: number; // what this company costs us / month
  status: "active" | "paused";
  credentialsSentAt: string | null;
  createdAt: string;
}

// A candidate invited to run a template for a company (candidate app reads these).
export interface Assessment {
  id: string;
  companyId: string | null;
  templateId: string | null;
  candidateName: string | null;
  candidateEmail: string;
  role: string | null;
  status: "invited" | "in_progress" | "submitted" | "closed";
  dueDate: string | null;
  matchScore: number | null;
  createdAt: string;
}

export type SessionStatus =
  | "live"
  | "submitted"
  | "evaluating"
  | "completed"
  | "stuck"
  | "failed";
export type SandboxHealth = "healthy" | "degraded" | "error";

// One candidate's assessment run, seen across all companies (PRD §1.11 monitor).
export interface Session {
  id: string;
  candidateName: string;
  companyName: string;
  templateName: string;
  status: SessionStatus;
  sandboxHealth: SandboxHealth;
  progressPct: number;
  durationMin: number;
  elapsedMin: number;
  startedAt: string; // ISO datetime
}
