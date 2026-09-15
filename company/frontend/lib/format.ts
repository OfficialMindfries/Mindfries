import type { ApplicationStage, CompanyRole, RoleStatus } from "./types";

export type Tone = "violet" | "coral" | "green" | "amber" | "gray";

export const stageLabel: Record<ApplicationStage, string> = {
  invited: "Invited",
  in_progress: "In Progress",
  completed: "Completed",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",
};

export const stageTone: Record<ApplicationStage, Tone> = {
  invited: "gray",
  in_progress: "violet",
  completed: "amber",
  shortlisted: "green",
  rejected: "coral",
  hired: "green",
};

export const roleStatusTone: Record<RoleStatus, Tone> = {
  open: "green",
  closed: "gray",
};

/** Same values as internal-admin's own sessionTone map — one shared `sessions` table, same status enum. */
export const sessionStatusTone: Record<string, Tone> = {
  live: "violet",
  submitted: "gray",
  evaluating: "amber",
  completed: "green",
  stuck: "coral",
  failed: "coral",
};

export const recommendationLabel: Record<string, string> = {
  strong_hire: "Strong Hire",
  hire: "Hire",
  lean_no: "Lean No",
  no_hire: "No Hire",
};

export const companyRoleLabel: Record<CompanyRole, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  viewer: "Viewer",
};

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
