import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "../supabase";
import { mailerReady, sendMail } from "../mailer";
import { hashPassword } from "./password";

// The two links this app sends by email: one that confirms an address, one
// that sets a new password (candidate_auth_tokens,
// 0018_candidate_account_and_knowledge.sql).
//
// A link carries a random token; the database holds only its SHA-256, so a
// read of the table yields nothing usable. A token works once, and for a
// limited time. Each kind is also limited per account per hour, so the form
// can't be used to flood someone's inbox.

type Kind = "verify" | "reset";

const TTL_MS: Record<Kind, number> = { verify: 48 * 3600_000, reset: 3600_000 };
const MAX_PER_HOUR = 3;
export const MIN_PASSWORD_LENGTH = 8;

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Where this site lives, for links in mail: CANDIDATE_PORTAL_URL, or the
 * production address Vercel gives the deployment.
 *
 * It is never taken from the request's Host header in production. That
 * header is whatever the caller sent, and a reset link built from it would
 * mail a working token to the real account holder pointing at a host the
 * caller chose. In development the request's host is used, since that is
 * the only address there is.
 */
export async function siteUrl(): Promise<string | null> {
  const fixed = process.env.CANDIDATE_PORTAL_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NODE_ENV === "production") return null;
  const h = await headers();
  return `http://${h.get("host") ?? "localhost:3000"}`;
}

/** Whether a link can be mailed at all: a mail provider, and an address for this site to put in it. */
export async function emailLinksReady(): Promise<boolean> {
  return mailerReady() && (await siteUrl()) !== null;
}

/** A fresh token for this account, or null when it has had its share for the hour. */
async function issue(candidateId: string, kind: Kind): Promise<string | null> {
  const c = db();
  if (!c) return null;
  const { count } = await c
    .from("candidate_auth_tokens")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidateId)
    .eq("kind", kind)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= MAX_PER_HOUR) return null;

  const token = randomBytes(32).toString("base64url");
  const { error } = await c.from("candidate_auth_tokens").insert({
    candidate_id: candidateId,
    kind,
    token_hash: hashOf(token),
    expires_at: new Date(Date.now() + TTL_MS[kind]).toISOString(),
  });
  return error ? null : token;
}

/**
 * Spends a token: marks it used and returns whose it was. The update is
 * conditional on it still being unused, so two requests with the same link
 * can't both succeed.
 */
async function spend(token: string, kind: Kind): Promise<string | null> {
  const c = db();
  if (!c || !token || token.length > 200) return null;
  const { data } = await c
    .from("candidate_auth_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashOf(token))
    .eq("kind", kind)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("candidate_id")
    .maybeSingle();
  return (data?.candidate_id as string | undefined) ?? null;
}

/** Whether a reset link is still good, without spending it — for showing the form or saying it has expired. */
export async function resetLinkIsLive(token: string): Promise<boolean> {
  const c = db();
  if (!c || !token || token.length > 200) return false;
  const { data } = await c
    .from("candidate_auth_tokens")
    .select("id")
    .eq("token_hash", hashOf(token))
    .eq("kind", "reset")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return !!data;
}

export type SendResult = "sent" | "not_configured" | "too_many" | "failed";

/** Mails the link that confirms this account's address. */
export async function sendVerification(candidate: { id: string; email: string; name: string }): Promise<SendResult> {
  const site = mailerReady() ? await siteUrl() : null;
  if (!site) return "not_configured";
  const token = await issue(candidate.id, "verify");
  if (!token) return "too_many";
  const link = `${site}/verify-email?token=${token}`;
  try {
    await sendMail({
      to: candidate.email,
      subject: "Confirm your email for Mindfries",
      text:
        `Hi ${candidate.name.split(/\s+/)[0] || "there"},\n\n` +
        `Confirm that this is your email address by opening this link:\n\n${link}\n\n` +
        `It works for 48 hours. Hiring teams see whether a candidate's email is confirmed.\n\n` +
        `If you didn't create a Mindfries account, you can ignore this message.\n`,
    });
    return "sent";
  } catch {
    return "failed";
  }
}

/** Confirms the address a verification link was sent to. Returns whether the link was good. */
export async function confirmEmail(token: string): Promise<boolean> {
  const c = db();
  const candidateId = await spend(token, "verify");
  if (!c || !candidateId) return false;
  const { error } = await c
    .from("candidate_users")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", candidateId)
    .is("email_verified_at", null);
  return !error;
}

/**
 * Mails a password-reset link if the address has an account. What the caller
 * learns is only whether mail can be sent at all — never whether the address
 * is registered.
 */
export async function requestPasswordReset(emailRaw: string): Promise<"ok" | "not_configured"> {
  const site = mailerReady() ? await siteUrl() : null;
  if (!site) return "not_configured";
  const c = db();
  const email = emailRaw.trim().toLowerCase();
  if (!c || !email) return "ok";

  const { data } = await c.from("candidate_users").select("id, email, name, status").eq("email", email).maybeSingle();
  if (!data || data.status !== "active") return "ok";

  const token = await issue(data.id as string, "reset");
  if (!token) return "ok";
  const link = `${site}/reset-password?token=${token}`;
  await sendMail({
    to: data.email as string,
    subject: "Reset your Mindfries password",
    text:
      `Hi ${String(data.name).split(/\s+/)[0] || "there"},\n\n` +
      `Open this link to choose a new password:\n\n${link}\n\n` +
      `It works once, for an hour. If you didn't ask for it, ignore this message — your password hasn't changed.\n`,
  }).catch(() => {
    // The caller can't be told without also being told the account exists.
  });
  return "ok";
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/** Sets a new password from a reset link. */
export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  const c = db();
  if (!c) return { ok: false, error: "The database isn't connected." };

  // Hash first: the token is only spent once there is something to save.
  const password_hash = await hashPassword(password);
  const candidateId = await spend(token, "reset");
  if (!candidateId) return { ok: false, error: "That link has expired or was already used. Ask for a new one." };

  const now = new Date().toISOString();
  const { data: before } = await c.from("candidate_users").select("email_verified_at").eq("id", candidateId).maybeSingle();
  const { error } = await c
    .from("candidate_users")
    .update({
      password_hash,
      failed_attempts: 0,
      locked_until: null,
      // Opening the link showed they receive mail at this address.
      email_verified_at: before?.email_verified_at ?? now,
    })
    .eq("id", candidateId);
  if (error) return { ok: false, error: "Couldn't save the new password — ask for a new link and try again." };

  // Any other reset link still out there for this account stops working.
  await c.from("candidate_auth_tokens").update({ used_at: now }).eq("candidate_id", candidateId).eq("kind", "reset").is("used_at", null);
  return { ok: true };
}
