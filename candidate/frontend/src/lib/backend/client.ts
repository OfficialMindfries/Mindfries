import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { currentCandidate } from "@/lib/auth/users";
import type { AssessmentStatus } from "@/lib/dashboard/data";
import { listAssessmentsFromDatabase } from "@/lib/dashboard/direct";
import { db } from "@/lib/supabase";

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
  /** The candidate's session for this assessment, when they have one — the workspace to resume, or the report to open. */
  sessionId?: string;
  /** Set for a company's invitation to this candidate — see Assessment in lib/dashboard/data.ts. */
  invitation?: { accepted: boolean; declined: boolean };
}

export interface SessionView {
  id: string;
  status: string;
  sandboxHealth: string;
  /** True when the session's workspace is a real sandbox rather than the browser. Absent from an older backend. */
  sandbox?: boolean;
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
  const rows = await request<(Omit<AssessmentView, "status"> & { status: string })[]>("/api/v1/assessments");
  // The backend already answers in this app's own status words; this only
  // guards the type, so a status it doesn't know (or the database's raw
  // "in_progress", should that ever come through) can't reach the dashboard
  // as something it has no way to draw.
  return rows.map((row) => ({ ...row, status: KNOWN_STATUS[row.status] ?? "closed" }));
}

const KNOWN_STATUS: Record<string, AssessmentStatus> = {
  invited: "invited",
  "in-progress": "in-progress",
  in_progress: "in-progress",
  submitted: "submitted",
  closed: "closed",
};

/**
 * The candidate's real assessments, or `undefined` when nothing could be
 * asked — never `[]` for "couldn't reach it", and never invented rows. The
 * Go backend answers when it's configured and reachable; otherwise the same
 * list is read straight from the shared Supabase
 * (lib/dashboard/direct.ts), so a deployment without the backend still
 * shows what's really there. `undefined` means neither source exists, and
 * callers render an honest "unavailable" state for it.
 */
export async function listAssessmentsOrUndefined(): Promise<AssessmentView[] | undefined> {
  const candidate = await currentCandidate();
  if (backendReady()) {
    try {
      return withInvitationAnswers(await listAssessments(), candidate?.email);
    } catch (err) {
      if (err instanceof BackendAuthError) return undefined; // middleware should have already caught this
      console.error("backend: listAssessments failed, reading the database directly instead:", err);
    }
  }
  if (!candidate) return undefined;
  const rows = await listAssessmentsFromDatabase(candidate.email);
  return rows && withInvitationAnswers(rows, candidate.email);
}

/**
 * Marks which rows are a company's invitation to this candidate, and what
 * they answered (lib/invitations.ts). Read from the shared database beside
 * either listing, so the dashboard shows the same thing whichever source
 * produced the list. If it can't be read the rows go through unmarked — an
 * invitation then shows a plain Start, as it did before answers existed.
 */
async function withInvitationAnswers(rows: AssessmentView[], email: string | undefined): Promise<AssessmentView[]> {
  const c = db();
  if (!c || !email || rows.length === 0) return rows;
  const { data, error } = await c
    .from("assessments")
    .select("id, accepted_at, declined_at")
    .eq("candidate_email", email.trim().toLowerCase());
  if (error || !data) return rows;
  const answers = new Map(data.map((r) => [r.id as string, { accepted: !!r.accepted_at, declined: !!r.declined_at }]));
  return rows.map((row) => {
    const invitation = answers.get(row.id);
    return invitation ? { ...row, invitation } : row;
  });
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

/**
 * Ends the session. `files` is the workspace as the candidate left it — the
 * backend records it as the final snapshot evaluation reads.
 */
export interface LiveInterviewStart {
  /** Presented as the first message on the call's WebSocket; good for a minute. */
  ticket: string;
  total: number;
  language: string;
  answerSeconds: number;
  inputRate: number;
  outputRate: number;
}

/**
 * Asks for a live voice interview call — see candidate/backend's
 * internal/httpapi/live.go. Answers 503 (a BackendError) when the backend has
 * no live voice line, which the caller treats as "hold it turn by turn".
 */
export async function startLiveInterview(sessionId: string, files: Record<string, string>): Promise<LiveInterviewStart> {
  return request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/interview/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
}

/**
 * A ticket and address for the session's live event stream, for a page to
 * subscribe with — see candidate/backend's handleSessionEvents. Undefined
 * when there's no backend or it can't be asked: the page then just polls.
 */
export async function sessionEventsOrUndefined(sessionId: string): Promise<{ url: string; ticket: string } | undefined> {
  if (!backendReady()) return undefined;
  try {
    const { ticket } = await request<{ ticket: string }>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events-ticket`, { method: "POST" });
    return { url: baseUrl().replace(/^http/, "ws") + "/api/v1/session-events", ticket };
  } catch {
    return undefined;
  }
}

// ── The sandbox workspace — candidate/backend's internal/httpapi/sandbox.go.
// A session whose `sandbox` is true has its files and terminal on a real
// machine; these are the calls the IDE makes to it. ────────────────────────

export interface SandboxEntry {
  path: string;
  size: number;
  modTime: number;
}

export interface SandboxFile {
  path: string;
  content: string;
  /** Why there is no content: "binary", "too_large" or "missing". */
  skipped?: string;
}

const sandboxPath = (sessionId: string, rest: string) => `/api/v1/sessions/${encodeURIComponent(sessionId)}/sandbox/${rest}`;
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function sandboxFiles(sessionId: string): Promise<{ entries: SandboxEntry[]; truncated: boolean }> {
  return request(sandboxPath(sessionId, "files"));
}

export async function sandboxRead(sessionId: string, paths: string[]): Promise<{ files: SandboxFile[] }> {
  return request(sandboxPath(sessionId, "read"), json("POST", { paths }));
}

export async function sandboxWrite(sessionId: string, path: string, content: string): Promise<void> {
  return request(sandboxPath(sessionId, "file"), json("PUT", { path, content }));
}

export async function sandboxChange(sessionId: string, change: { op: "delete" | "move" | "mkdir"; path: string; to?: string }): Promise<void> {
  return request(sandboxPath(sessionId, "change"), json("POST", change));
}

export async function sandboxRun(sessionId: string, command: string, timeoutSec?: number): Promise<{ exitCode: number; output: string; truncated: boolean; ms: number }> {
  return request(sandboxPath(sessionId, "run"), json("POST", { command, timeoutSec }));
}

/** A ticket and address for the sandbox terminal's WebSocket — the same two-step as the event stream. */
export async function sandboxTerminal(sessionId: string): Promise<{ url: string; ticket: string }> {
  const { ticket } = await request<{ ticket: string }>(sandboxPath(sessionId, "terminal-ticket"), { method: "POST" });
  return { url: baseUrl().replace(/^http/, "ws") + "/api/v1/sandbox-terminal", ticket };
}

/** Where the browser opens the live interview call: the backend's own address, as a WebSocket. */
export function liveInterviewUrl(): string {
  return baseUrl().replace(/^http/, "ws") + "/api/v1/live-interview";
}

/**
 * Saves the workspace as it stands, replacing the last checkpoint. It's what
 * the backend submits if the candidate never does — see
 * candidate/backend's orchestrator/abandoned.go.
 */
export async function saveCheckpoint(sessionId: string, files: Record<string, string>): Promise<void> {
  return request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
}

export async function submitSession(
  sessionId: string,
  files?: Record<string, string>,
): Promise<{ sessionId: string; status: string }> {
  return request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files ?? {} }),
  });
}

// ── The workspace assistant and the follow-up interview
// (candidate/backend/internal/httpapi/conversation.go) ─────────────────────

export interface ConversationTurn {
  role: "candidate" | "assistant";
  text: string;
}

export interface AssistantHistory {
  messages: ConversationTurn[];
  /** False when the backend has no model key — the panel says so instead of accepting questions it can't answer. */
  configured: boolean;
  /** False when the hiring company switched the assistant off for this role. */
  enabled: boolean;
  /** How many messages the candidate may send in this session, and how many they have. */
  limit: number;
  used: number;
}

export async function getAssistantHistory(sessionId: string): Promise<AssistantHistory> {
  return request<AssistantHistory>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/assistant`);
}

/**
 * One question to the workspace assistant, answered as a stream. Returns the
 * backend's raw response rather than a parsed value: on success its body is
 * server-sent events ("delta" pieces, then "done"), which the caller passes
 * on to the browser as they arrive; when the question is refused outright it
 * is an ordinary JSON error with the backend's own status.
 */
export async function streamAssistant(sessionId: string, question: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const cookie = await authHeader();
  const res = await fetch(`${baseUrl()}/api/v1/sessions/${encodeURIComponent(sessionId)}/assistant/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Cookie: cookie },
    body: JSON.stringify(question),
    cache: "no-store",
    signal,
  });
  if (res.status === 401) throw new BackendAuthError();
  return res;
}

export interface InterviewState {
  /** The question waiting for an answer. Absent once `done`. */
  question?: string;
  done: boolean;
  asked: number;
  total: number;
  /** BCP-47 tag the interview is held in — set by the hiring company on the role. */
  language: string;
  /** The limit per answer, and what's left of it for the waiting question (measured by the backend). */
  answerSeconds: number;
  secondsLeft?: number;
  /** With `done`: the session ran out of time before every question was asked. */
  cutShort?: boolean;
}

export interface InterviewInput {
  answer?: string;
  /** Records the waiting question as unanswered — the answer timer ran out with nothing to send. */
  skip?: boolean;
  /** The workspace files, sent when the interview opens so the questions are about the real code. */
  files?: Record<string, string>;
}

/** One step of the interview: records the answer (or skip) if given, returns the next question or `done`. */
export async function interviewStep(sessionId: string, input: InterviewInput = {}): Promise<InterviewState> {
  return request<InterviewState>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: input.answer ?? "", skip: input.skip ?? false, files: input.files ?? {} }),
  });
}

export async function getSessionReport(sessionId: string): Promise<ReportView> {
  return request<ReportView>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/report`);
}

export interface SessionAssessmentView {
  /** The template's real name — what the workspace header shows. */
  name?: string;
  taskBrief?: string;
  starterFiles?: Record<string, string>;
}

/**
 * The real task brief + starting files behind a session — what makes the
 * IDE's task panel, header and workspace real (see IdeShell.tsx). Fetched once, server-side, when the IDE
 * page renders — not polled the way session status is, since starterFiles
 * can be real file content.
 */
export async function getSessionAssessmentOrUndefined(sessionId: string): Promise<SessionAssessmentView | undefined> {
  if (!backendReady()) return undefined;
  try {
    return await request<SessionAssessmentView>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/assessment`);
  } catch (err) {
    if (err instanceof BackendAuthError) return undefined; // no session cookie / not this candidate's — the page itself already redirects for the former
    console.error("backend: getSessionAssessment failed, falling back to the IDE's own honest defaults:", err);
    return undefined;
  }
}

export interface SavedWorkspaceView {
  files: Record<string, string>;
  /** When the server took this copy, ISO 8601. */
  savedAt: string;
  /** The interview has begun: the work can be read but no longer changed. */
  frozen: boolean;
}

/**
 * The latest copy of the session's files the server holds, for restoring a
 * workspace this browser doesn't have. Undefined when nothing has been
 * saved yet, or it couldn't be asked — the workspace then opens from this
 * browser's own copy, or the task's starting files.
 */
export async function getSavedWorkspaceOrUndefined(sessionId: string): Promise<SavedWorkspaceView | undefined> {
  if (!backendReady()) return undefined;
  try {
    return (await request<SavedWorkspaceView | undefined>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workspace`)) ?? undefined;
  } catch (err) {
    if (!(err instanceof BackendAuthError)) console.error("backend: getSavedWorkspace failed:", err);
    return undefined;
  }
}

/**
 * The session's own clock — how long it runs and when it started — so the
 * workspace timer counts down from what's really left rather than restarting
 * a fixed duration on every page load. Same honest degrade as above.
 */
export async function getSessionOrUndefined(sessionId: string): Promise<SessionView | undefined> {
  if (!backendReady()) return undefined;
  try {
    return await getSession(sessionId);
  } catch (err) {
    if (!(err instanceof BackendAuthError)) console.error("backend: getSession failed:", err);
    return undefined;
  }
}

/**
 * Like getSessionOrUndefined, but tells apart the two reasons there is no
 * session to show: the backend couldn't be asked (undefined — the workspace
 * degrades honestly, as before), and the backend answered that there is no
 * such session for this candidate ("missing" — someone else's id, a
 * mistyped one, a made-up one).
 */
export async function getSessionOrMissing(sessionId: string): Promise<SessionView | undefined | "missing"> {
  if (!backendReady()) return undefined;
  try {
    return await getSession(sessionId);
  } catch (err) {
    if (err instanceof BackendError && err.status === 404) return "missing";
    if (!(err instanceof BackendAuthError)) console.error("backend: getSession failed:", err);
    return undefined;
  }
}

/** Seconds left on a session, measured from when it actually started. Never negative. */
export function secondsRemaining(session: SessionView): number {
  const elapsed = (Date.now() - Date.parse(session.startedAt)) / 1000;
  return Math.max(0, Math.round(session.durationMin * 60 - elapsed));
}
