import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Server-only client for the Go company backend's billing routes
 * (company/backend/internal/httpapi/billing.go). Mirrors
 * internal-admin/frontend's own lib/backend/client.ts byte for byte in
 * shape: every call forwards the caller's real "mf_company" cookie as a
 * header rather than re-asserting who's signed in, and the Go backend
 * independently verifies that signature itself (internal/session) — this
 * app never has to be trusted with authorization, only with relaying the
 * one signed artifact that already proves it.
 *
 * Scope: billing only. Roles/candidates/team are already real, working CRUD
 * against Supabase in lib/db.ts — company/backend's equivalent routes exist
 * (Phases 2-3) but routing this app's already-correct CRUD through an extra
 * network hop for identical behavior is exactly what ARCHITECTURE.md argues
 * against ("adds a deploy target and a network hop for no benefit"). Billing
 * is different: real Stripe checkout/webhooks genuinely can't happen from
 * this app's server layer alone (see ARCHITECTURE.md's compute-not-CRUD
 * carve-out), so that's the one surface actually wired up here.
 *
 * COMPANY_BACKEND_URL comes from the environment, same as every other
 * cross-service address in this repo (SUPABASE_URL, DATABASE_URL) — never
 * hardcoded.
 */

export function backendReady(): boolean {
  return !!process.env.COMPANY_BACKEND_URL;
}

function baseUrl(): string {
  const url = process.env.COMPANY_BACKEND_URL;
  if (!url) {
    // Callers are expected to check backendReady() first; this is the
    // honest failure for the one place that doesn't.
    throw new Error("COMPANY_BACKEND_URL is not configured");
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
  if (res.status === 403) throw new BackendAuthError("Your role doesn't allow this — ask a company admin");

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = typeof body?.error === "string" ? body.error : `backend request failed (${res.status})`;
    throw new BackendError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type BillingPlan = "starter" | "growth" | "enterprise";

/** POST /api/v1/billing/checkout-session — opens a real Stripe Checkout Session, returns the URL to redirect the browser to. */
export async function createCheckoutSessionViaBackend(plan: BillingPlan, quantity?: number): Promise<{ url: string }> {
  return request("/api/v1/billing/checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, quantity }),
  });
}

/** POST /api/v1/billing/portal-session — opens a Stripe-hosted self-serve billing portal session, returns the URL to redirect the browser to. */
export async function createPortalSessionViaBackend(): Promise<{ url: string }> {
  return request("/api/v1/billing/portal-session", { method: "POST" });
}
