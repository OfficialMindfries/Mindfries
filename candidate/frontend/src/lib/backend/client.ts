import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import type { AssessmentStatus } from "@/lib/dashboard/data";

/**
 * Server-only client for the Go candidate backend
 * (candidate/backend — System_Archetect_And_PRD.md §2.3). Every call here
 * forwards the caller's real "mf_candidate" cookie as a header — this app
 * never re-asserts who the candidate is, it relays the one signed artifact
 * that already proves it, and the Go backend independently verifies that
 * signature itself (internal/session) rather than trusting this relay.
 * That's what makes a session's data isolated to its own candidate even if
 * something upstream of the backend were compromised: ownership is checked
 * against the cookie's HMAC-verified claims on the Go side, never against
 * anything this client sends about who it thinks the candidate is.
 *
 * No URL, model, or id is hardcoded here — CANDIDATE_BACKEND_URL comes from
 * the environment, same as every other cross-service address in this repo
 * (SUPABASE_URL, DATABASE_URL).
 */

export function backendReady(): boolean {
  return !!process.env.CANDIDATE_BACKEND_URL;
}

function baseUrl(): string {
  const url = process.env.CANDIDATE_BACKEND_URL;
  if (!url) {
    // Callers are expected to check backendReady() first; this is the
    // honest failure for the one place that doesn't.
    throw new Error("CANDIDATE_BACKEND_URL is not configured");
  }
  return url.replace(/\/+$/, "");
}

/** Thrown when there's no session cookie to forward, or the backend refuses it (expired, tampered, wrong secret). */
export class BackendAuthError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "BackendAuthError";
  }
}

/** Any other non-2xx response from the backend, with its own status and the server's own error message. */
export class BackendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

async function authHeader(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) throw new BackendAuthError();
  return `${SESSION_COOKIE}=${token}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const cookie = await authHeader();
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { ...init?.headers, Cookie: cookie },
      // Every one of these calls is either identity-specific or about to
      // change state — none of it should ever be cached by the fetch layer.
      cache: "no-store",
    });
  } catch (err) {
    throw new BackendError(err instanceof Error ? err.message : "could not reach the backend", 0);
  }

  if (res.status === 401) throw new BackendAuthError();

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = typeof body?.error === "string" ? body.error : `backend request failed (${res.status})`;
    throw new BackendError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Types — kept in exact lockstep with candidate/backend's own response
// shapes (internal/httpapi/candidate.go); this is the one place either side
// changing without the other would actually break. ───────────────────────

export interface AssessmentView {
  id: string;
  role: string;
  company: string;
  location: string;
  tags: string[];
  // A real per-candidate invitation (assessments.status) or the open pool's
  // constant "invited" (every published template, same as before) — the
  // backend distinguishes internally; this type just needs to cover both.
  status: AssessmentStatus;
  due: string;
  /** Only ever present on a real invitation (assessments.match_score) — the open pool has no per-candidate match to compute. */
  match?: number;
}

export interface SessionView {
  id: string;
  status: string;
  sandboxHealth: string;
  progressPct: number;
  durationMin: number;
  elapsedMin: number;
  startedAt: string;
}

export interface EvidenceItemView {
  category: string;
  observation: string;
}

export interface ReportView {
  status: "pending" | "generating" | "ready" | "failed";
  recommendation?: string;
  summary?: string;
  error?: string;
  evidence?: EvidenceItemView[];
}

export interface NewActivityEvent {
  type: string;
  payload: unknown;
}

export async function listAssessments(): Promise<AssessmentView[]> {
  return request<AssessmentView[]>("/api/v1/assessments");
}

/**
 * Assessments if the backend is configured and actually answers, else
 * `undefined` — never `[]` for "couldn't reach it". An empty array reads as
 * "you have no assessments" on the dashboard; a transient backend outage
 * isn't that, so it degrades to the same honest sample fallback as
 * "unconfigured" rather than showing a false empty state.
 */
export async function listAssessmentsOrUndefined(): Promise<AssessmentView[] | undefined> {
  if (!backendReady()) return undefined;
  try {
    return await listAssessments();
  } catch (err) {
    if (err instanceof BackendAuthError) return undefined; // middleware should have already caught this; fail closed to sample rather than crash the page
    console.error("backend: listAssessments failed, falling back to sample data:", err);
    return undefined;
  }
}

export async function startSession(templateId: string): Promise<SessionView> {
  return request<SessionView>(`/api/v1/assessments/${encodeURIComponent(templateId)}/sessions`, { method: "POST" });
}

export async function getSession(sessionId: string): Promise<SessionView> {
  return request<SessionView>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
}

export async function postSessionEvents(sessionId: string, events: NewActivityEvent[]): Promise<{ recorded: number }> {
  return request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

export async function submitSession(sessionId: string): Promise<{ sessionId: string; status: string }> {
  return request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/submit`, { method: "POST" });
}

export async function getSessionReport(sessionId: string): Promise<ReportView> {
  return request<ReportView>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/report`);
}
