import "server-only";
import { db } from "./supabase";
import type {
  GameTemplate, Lead, LeadStage, OnboardedCompany, Plan, RubricCriterion,
  Session, SessionStatus, SandboxHealth, TaskVariant, TemplateStatus, WaitlistEntry,
} from "./types";
import type { RawLead } from "./icp";

// Data access for the Tracker. Every read returns [] when Supabase isn't wired
// yet, so pages render empty states instead of crashing pre-setup.

/* eslint-disable @typescript-eslint/no-explicit-any */
function toLead(r: any, counts?: { emailed: number; opened: number; replied: number }): Lead {
  return {
    id: r.id,
    company: r.company,
    domain: r.domain ?? null,
    contactEmail: r.contact_email ?? null,
    source: r.source,
    sourceUrl: r.source_url ?? null,
    roleTitle: r.role_title ?? null,
    location: r.location ?? null,
    tags: r.tags ?? [],
    score: r.score ?? 0,
    stage: r.stage as LeadStage,
    lastEmailedAt: r.last_emailed_at ?? null,
    createdAt: r.created_at,
    emailedCount: counts?.emailed ?? 0,
    openedCount: counts?.opened ?? 0,
    repliedCount: counts?.replied ?? 0,
  };
}

export async function listLeads(): Promise<Lead[]> {
  const c = db();
  if (!c) return [];
  const [{ data: leads }, { data: events }] = await Promise.all([
    c.from("leads").select("*").order("score", { ascending: false }).order("created_at", { ascending: false }),
    c.from("email_events").select("lead_id,type"),
  ]);
  const byLead = new Map<string, { emailed: number; opened: number; replied: number }>();
  for (const e of events ?? []) {
    const agg = byLead.get(e.lead_id) ?? { emailed: 0, opened: 0, replied: 0 };
    if (e.type === "sent") agg.emailed++;
    else if (e.type === "opened") agg.opened++;
    else if (e.type === "replied") agg.replied++;
    byLead.set(e.lead_id, agg);
  }
  return (leads ?? []).map((r) => toLead(r, byLead.get(r.id)));
}

// Insert only companies we haven't seen (dedup by generated company_key).
// Returns how many new leads landed. Used by the daily cron.
export async function upsertLeads(rows: (RawLead & { score: number })[]): Promise<number> {
  const c = db();
  if (!c || rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    company: r.company,
    domain: r.domain,
    source: r.source,
    source_url: r.sourceUrl,
    role_title: r.roleTitle,
    location: r.location,
    tags: r.tags,
    score: r.score,
  }));
  const { data, error } = await c
    .from("leads")
    .upsert(payload, { onConflict: "company_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function setLeadStage(id: string, stage: LeadStage): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c.from("leads").update({ stage }).eq("id", id);
  if (error) throw error;
}

export async function recordEmailEvent(e: {
  leadId: string;
  type: "sent" | "delivered" | "opened" | "clicked" | "replied" | "bounced";
  template?: string;
  resendId?: string;
}): Promise<void> {
  const c = db();
  if (!c) return;
  await c.from("email_events").insert({
    lead_id: e.leadId,
    type: e.type,
    template: e.template ?? null,
    resend_id: e.resendId ?? null,
  });
  if (e.type === "sent") {
    const now = new Date().toISOString();
    await c.from("leads").update({ last_emailed_at: now }).eq("id", e.leadId);
    // Advance new → emailed; leave later stages (replied/demo/...) untouched.
    await c.from("leads").update({ stage: "emailed" }).eq("id", e.leadId).eq("stage", "new");
  }
}

// Resend webhooks reference our message by resend_id; map the engagement back
// to the lead that email_events row belongs to.
export async function leadIdForResendId(resendId: string): Promise<string | null> {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("email_events").select("lead_id").eq("resend_id", resendId).limit(1).single();
  return data?.lead_id ?? null;
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("waitlist").select("*").order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name ?? null, email: r.email, company: r.company ?? null,
    message: r.message ?? null, createdAt: r.created_at,
  }));
}

export async function addWaitlist(e: { name?: string; email: string; company?: string; message?: string }): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c.from("waitlist").insert({
    name: e.name ?? null, email: e.email, company: e.company ?? null, message: e.message ?? null,
  });
  if (error) throw error;
}

export async function listOnboarded(): Promise<OnboardedCompany[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("onboarded_companies").select("*").order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, company: r.company, adminEmail: r.admin_email, plan: r.plan as Plan,
    monthlyCost: Number(r.monthly_cost), status: r.status, credentialsSentAt: r.credentials_sent_at ?? null,
    createdAt: r.created_at,
  }));
}

// ── Shared product tables (0002_product.sql) ────────────────────────────────
// The Assessment/Game Library — internal-admin authors, candidate app consumes.

function toTemplate(r: any): GameTemplate {
  return {
    id: r.id,
    name: r.name,
    taskVariant: r.task_variant as TaskVariant,
    repoTemplate: r.repo_template ?? "",
    techStack: r.tech_stack ?? [],
    durationMin: r.duration_min ?? 60,
    interviewerPrompt: r.interviewer_prompt ?? "",
    rubric: (r.rubric ?? []) as RubricCriterion[],
    status: r.status as TemplateStatus,
    usedByCompanies: r.used_by_companies ?? 0,
    createdAt: r.created_at,
  };
}

export async function listTemplates(): Promise<GameTemplate[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("game_templates").select("*").order("created_at", { ascending: false });
  return (data ?? []).map(toTemplate);
}

export async function createTemplate(t: {
  name: string; taskVariant: TaskVariant; repoTemplate: string; techStack: string[];
  durationMin: number; interviewerPrompt: string; rubric: RubricCriterion[]; status: TemplateStatus;
}): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c.from("game_templates").insert({
    name: t.name, task_variant: t.taskVariant, repo_template: t.repoTemplate, tech_stack: t.techStack,
    duration_min: t.durationMin, interviewer_prompt: t.interviewerPrompt, rubric: t.rubric, status: t.status,
  });
  if (error) throw error;
}

export async function setTemplateStatus(id: string, status: TemplateStatus): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c.from("game_templates").update({ status }).eq("id", id);
  if (error) throw error;
}

// Global Session Monitor — reads what the candidate app writes (with company +
// template names joined in).
function toSession(r: any): Session {
  return {
    id: r.id,
    candidateName: r.candidate_name ?? "Candidate",
    companyName: r.companies?.name ?? "—",
    templateName: r.game_templates?.name ?? "—",
    status: r.status as SessionStatus,
    sandboxHealth: r.sandbox_health as SandboxHealth,
    progressPct: r.progress_pct ?? 0,
    durationMin: r.duration_min ?? 60,
    elapsedMin: r.elapsed_min ?? 0,
    startedAt: r.started_at,
  };
}

export async function listSessions(): Promise<Session[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("sessions")
    .select("*, companies(name), game_templates(name)")
    .order("started_at", { ascending: false });
  return (data ?? []).map(toSession);
}

// Support overrides (PRD §1.11): reset a stuck sandbox, re-trigger evaluation.
export async function setSessionState(
  id: string,
  patch: { status?: SessionStatus; sandboxHealth?: SandboxHealth; progressPct?: number; elapsedMin?: number },
): Promise<void> {
  const c = db();
  if (!c) return;
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.sandboxHealth !== undefined) row.sandbox_health = patch.sandboxHealth;
  if (patch.progressPct !== undefined) row.progress_pct = patch.progressPct;
  if (patch.elapsedMin !== undefined) row.elapsed_min = patch.elapsedMin;
  const { error } = await c.from("sessions").update(row).eq("id", id);
  if (error) throw error;
}

export async function addOnboarded(e: {
  leadId?: string; company: string; adminEmail: string; plan: Plan; monthlyCost: number;
}): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c.from("onboarded_companies").insert({
    lead_id: e.leadId ?? null, company: e.company, admin_email: e.adminEmail,
    plan: e.plan, monthly_cost: e.monthlyCost, credentials_sent_at: new Date().toISOString(),
  });
  if (error) throw error;
  if (e.leadId) await setLeadStage(e.leadId, "onboarded");
}
