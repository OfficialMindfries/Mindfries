import type {
  TaskVariant,
  SessionStatus,
  CompanyStatus,
  TemplateStatus,
  SandboxHealth,
  Plan,
  LeadStage,
} from "./types";

export type Tone = "violet" | "coral" | "green" | "amber" | "gray";

export const taskVariantLabel: Record<TaskVariant, string> = {
  bug_fix: "Bug Fix",
  feature: "Feature",
  refactor: "Refactor",
  debug: "Debug",
};

export const planLabel: Record<Plan, string> = {
  trial: "Trial",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export const sessionTone: Record<SessionStatus, Tone> = {
  live: "violet",
  submitted: "gray",
  evaluating: "amber",
  completed: "green",
  stuck: "coral",
  failed: "coral",
};

export const companyTone: Record<CompanyStatus, Tone> = {
  onboarding: "amber",
  active: "green",
  paused: "gray",
};

export const templateTone: Record<TemplateStatus, Tone> = {
  draft: "gray",
  published: "green",
};

export const healthTone: Record<SandboxHealth, Tone> = {
  healthy: "green",
  degraded: "amber",
  error: "coral",
};

export const leadStageLabel: Record<LeadStage, string> = {
  new: "New",
  emailed: "Emailed",
  replied: "Replied",
  demo: "Demo",
  poc: "POC",
  onboarded: "Onboarded",
  rejected: "Rejected",
};

export const leadStageTone: Record<LeadStage, Tone> = {
  new: "gray",
  emailed: "violet",
  replied: "amber",
  demo: "amber",
  poc: "coral",
  onboarded: "green",
  rejected: "gray",
};

// What each plan bills per month — the revenue side of the cost/margin view.
export const planPrice: Record<Plan, number> = {
  trial: 0,
  starter: 99,
  growth: 399,
  enterprise: 1500,
};

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
