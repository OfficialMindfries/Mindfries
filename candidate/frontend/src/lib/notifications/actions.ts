"use server";

import { db } from "../supabase";
import { currentCandidate } from "../auth/users";
import { deriveNotifications, type DerivedNotification, type InvitationFact, type ReportFact } from "./derive";

// The bell's server side: read the candidate's records, derive what is
// worth telling them (derive.ts), and remember what they've read or
// dismissed (candidate_notification_state, 0019_invitations_and_setup.sql).
//
// Everything is scoped to the signed-in candidate — invitations by their
// email, sessions and state by their id — and nothing here takes either
// from the request.

export interface BellItem extends DerivedNotification {
  read: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loadNotifications(): Promise<BellItem[]> {
  const candidate = await currentCandidate();
  const c = db();
  if (!candidate || !c) return [];

  const [invites, sessions, state] = await Promise.all([
    c.from("assessments").select("id, role, status, accepted_at, created_at, due_date, company_id, companies(name)").eq("candidate_email", candidate.email),
    c.from("sessions").select("id, assessment_id, assessment_reports(status, updated_at)").eq("candidate_id", candidate.id),
    c.from("candidate_notification_state").select("key, read_at, dismissed_at").eq("candidate_id", candidate.id),
  ]);

  const invitationFacts: InvitationFact[] = (invites.data ?? []).map((r: any) => ({
    id: r.id,
    role: r.role || "an assessment",
    company: r.companies?.name || "A company",
    status: r.status,
    accepted: !!r.accepted_at,
    createdAt: r.created_at,
    dueDate: r.due_date ?? null,
  }));
  const roleOf = new Map(invitationFacts.map((i) => [i.id, i.role]));

  const reportFacts: ReportFact[] = [];
  for (const s of (sessions.data ?? []) as any[]) {
    // One report per session; the relation comes back as an object or a
    // one-element list depending on how the key is inferred.
    const report = Array.isArray(s.assessment_reports) ? s.assessment_reports[0] : s.assessment_reports;
    if (!report) continue;
    reportFacts.push({ sessionId: s.id, role: (s.assessment_id && roleOf.get(s.assessment_id)) || null, status: report.status, updatedAt: report.updated_at });
  }

  const marks = new Map<string, { read: boolean; dismissed: boolean }>(
    (state.data ?? []).map((r: any) => [r.key as string, { read: !!r.read_at, dismissed: !!r.dismissed_at }]),
  );

  return deriveNotifications(invitationFacts, reportFacts, Date.now())
    .filter((n) => !marks.get(n.id)?.dismissed)
    .map((n) => ({ ...n, read: !!marks.get(n.id)?.read }));
}

const validKey = (key: string) => typeof key === "string" && /^[a-z-]+:[0-9a-f-]{36}$/i.test(key);

/** Marks these notifications read. Called when the bell is opened. */
export async function markNotificationsRead(keys: string[]): Promise<void> {
  const candidate = await currentCandidate();
  const c = db();
  const wanted = (Array.isArray(keys) ? keys : []).filter(validKey).slice(0, 100);
  if (!candidate || !c || wanted.length === 0) return;
  const now = new Date().toISOString();
  await c
    .from("candidate_notification_state")
    .upsert(wanted.map((key) => ({ candidate_id: candidate.id, key, read_at: now })), { onConflict: "candidate_id,key", ignoreDuplicates: false });
}

/** Dismisses one. It stays gone, on any device, for as long as it would have been shown. */
export async function dismissNotification(key: string): Promise<void> {
  const candidate = await currentCandidate();
  const c = db();
  if (!candidate || !c || !validKey(key)) return;
  const now = new Date().toISOString();
  await c
    .from("candidate_notification_state")
    .upsert({ candidate_id: candidate.id, key, read_at: now, dismissed_at: now }, { onConflict: "candidate_id,key" });
}
