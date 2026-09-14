import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Server-only client for the Go candidate backend's Admin API
 * (candidate/backend/internal/httpapi/admin.go — System_Archetect_And_PRD.md
 * §2.3). Mirrors candidate/frontend's own lib/backend/client.ts byte for
 * byte in shape: every call forwards the caller's real "mf_admin" cookie as
 * a header rather than re-asserting who's signed in, and the Go backend
 * independently verifies that signature itself (internal/session) — this
 * app never has to be trusted with authorization, only with relaying the
 * one signed artifact that already proves it.
 *
 * ADMIN_BACKEND_URL comes from the environment, same as every other
 * cross-service address in this repo (SUPABASE_URL, DATABASE_URL) — never
 * hardcoded. A separate variable from candidate/frontend's own
 * CANDIDATE_BACKEND_URL on purpose: two different Next apps, two different
 * env files, even though both point at the same Go process today.
 */

export function backendReady(): boolean {
  return !!process.env.ADMIN_BACKEND_URL;
}

function baseUrl(): string {
  const url = process.env.ADMIN_BACKEND_URL;
  if (!url) {
    // Callers are expected to check backendReady() first; this is the
    // honest failure for the one place that doesn't.
    throw new Error("ADMIN_BACKEND_URL is not configured");
  }
  return url.replace(/\/+$/, "");
}

/** Thrown when there's no session cookie to forward, or the backend refuses it (expired, tampered, wrong secret, wrong role). */
export class BackendAuthError extends Error {
  constructor(message = "Not signed in") {
    super(message);
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
      cache: "no-store",
    });
  } catch (err) {
    throw new BackendError(err instanceof Error ? err.message : "could not reach the backend", 0);
  }

  if (res.status === 401) throw new BackendAuthError();
  if (res.status === 403) throw new BackendAuthError("Your account is view-only — ask an admin to do this");

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = typeof body?.error === "string" ? body.error : `backend request failed (${res.status})`;
    throw new BackendError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface AdminResetPatch {
  status?: string;
  sandboxHealth?: string;
  progressPct?: number;
  elapsedMin?: number;
}

/** POST /api/v1/admin/sessions/{id}/reset — the real support-override reset, including Daytona sandbox teardown if one exists. */
export async function resetSessionViaBackend(sessionId: string, patch?: AdminResetPatch): Promise<void> {
  await request(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}/reset`, {
    method: "POST",
    headers: patch ? { "Content-Type": "application/json" } : undefined,
    body: patch ? JSON.stringify(patch) : undefined,
  });
}

/** POST /api/v1/admin/sessions/{id}/retrigger-evaluation — re-runs the real Evaluation Engine pipeline. */
export async function retriggerEvaluationViaBackend(sessionId: string): Promise<void> {
  await request(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}/retrigger-evaluation`, { method: "POST" });
}
