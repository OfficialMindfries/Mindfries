import "server-only";
import { db } from "@/lib/supabase";
import type { Assessment, AssessmentStatus } from "@/lib/dashboard/data";

/**
 * The same list candidate/backend's handleListAssessments builds — this
 * candidate's real invitations (`assessments`, matched by email) followed by
 * the open pool of published templates — read straight from the shared
 * Supabase instead. It exists for the one case the Go backend can't cover:
 * it isn't deployed or isn't reachable. The dashboard used to show invented
 * companies in that case; a real, possibly empty, list is the honest
 * alternative.
 *
 * Read-only on purpose. Starting a session still goes through the backend
 * (see app/onboarding/actions.ts) — that's where the session row, sandbox
 * and evidence capture are owned.
 *
 * Returns `undefined`, not `[]`, when Supabase isn't configured or the
 * query fails: "couldn't look" and "nothing there" are different answers.
 */

const STATUSES: Record<string, AssessmentStatus> = {
  invited: "invited",
  in_progress: "in-progress",
  submitted: "submitted",
  closed: "closed",
  // An invitation the candidate turned down is finished, as far as the wall
  // is concerned; `invitation.declined` is what says why.
  declined: "closed",
};

// Mirrors techStackTags in candidate/backend/internal/httpapi/candidate.go.
function tags(stack: string[] | null, durationMin: number | null): string[] {
  return [...(stack ?? []).slice(0, 2), `${durationMin ?? 60} min`];
}

interface TemplateRow {
  id: string;
  name: string;
  tech_stack: string[] | null;
  duration_min: number | null;
  status: string;
}

export async function listAssessmentsFromDatabase(candidateEmail: string): Promise<Assessment[] | undefined> {
  const c = db();
  if (!c) return undefined;

  const [invites, published] = await Promise.all([
    c
      .from("assessments")
      .select("id, company_id, template_id, role, status, due_date, match_score")
      .eq("candidate_email", candidateEmail.trim().toLowerCase())
      .order("created_at", { ascending: false }),
    c
      .from("game_templates")
      .select("id, name, tech_stack, duration_min, status")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
  ]);
  if (invites.error || published.error) {
    console.error("dashboard: direct assessment read failed:", invites.error ?? published.error);
    return undefined;
  }

  const inviteRows = invites.data ?? [];
  const templates = new Map<string, TemplateRow>((published.data ?? []).map((t: TemplateRow) => [t.id, t]));
  const companies = new Map<string, string>();

  // An invitation never required its template to be published, so the ones
  // the published list didn't already cover are fetched by id.
  const missingTemplates = [...new Set(inviteRows.map((r) => r.template_id).filter((id) => id && !templates.has(id)))];
  const companyIds = [...new Set(inviteRows.map((r) => r.company_id).filter(Boolean))];
  const [extraTemplates, companyRows] = await Promise.all([
    missingTemplates.length
      ? c.from("game_templates").select("id, name, tech_stack, duration_min, status").in("id", missingTemplates)
      : null,
    companyIds.length ? c.from("companies").select("id, name").in("id", companyIds) : null,
  ]);
  for (const t of (extraTemplates?.data ?? []) as TemplateRow[]) templates.set(t.id, t);
  for (const row of companyRows?.data ?? []) companies.set(row.id, row.name);

  const invited: Assessment[] = inviteRows.map((r) => {
    const t = r.template_id ? templates.get(r.template_id) : undefined;
    return {
      id: r.id,
      role: r.role || t?.name || "Untitled assessment",
      company: (r.company_id && companies.get(r.company_id)) || "—",
      location: "Remote",
      tags: tags(t?.tech_stack ?? null, t?.duration_min ?? null),
      status: STATUSES[r.status] ?? "invited",
      due: r.due_date ? `Due ${r.due_date}` : "No due date set",
      ...(typeof r.match_score === "number" ? { match: r.match_score } : {}),
    };
  });

  const open: Assessment[] = ((published.data ?? []) as TemplateRow[]).map((t) => ({
    id: t.id,
    role: t.name,
    company: "Mindfries",
    location: "Remote",
    tags: tags(t.tech_stack, t.duration_min),
    status: "invited",
    due: "Open now",
  }));

  return [...invited, ...open];
}
