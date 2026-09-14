import "server-only";
import { db } from "../supabase";
import type { OAuthProfile, OAuthProviderId } from "./oauth-providers";
import type { Session } from "./session";

// What happens once a provider has actually confirmed who someone is (see
// oauth-providers.ts) — find or create the one candidate_users row this
// identity belongs to, exactly the account-linking policy the migration's
// comment describes:
//
//  1. This exact provider identity has signed in before -> that account.
//  2. First time for this identity, but the provider gave a verified email
//     that already has a password/other-provider account -> link to it,
//     don't fork a second account for the same person.
//  3. Neither -> a brand new candidate_users row, password_hash left null.
//
// Every branch ends the same way callers of checkCredentials already expect:
// session claims, or a reason it refused — never a thrown error a route
// handler would have to guess how to render.

export type OAuthSignInResult = { ok: true; session: Omit<Session, "exp"> } | { ok: false; error: string };

interface CandidateAccountRow {
  id: string;
  email: string;
  name: string;
  status: "active" | "disabled";
}

export async function signInWithOAuth(provider: OAuthProviderId, profile: OAuthProfile): Promise<OAuthSignInResult> {
  const c = db();
  if (!c) return { ok: false, error: "Supabase isn't configured — accounts can't be created or checked." };

  // 1. Seen this exact identity before?
  const { data: identity, error: identityErr } = await c
    .from("candidate_oauth_identities")
    .select("candidate_id")
    .eq("provider", provider)
    .eq("provider_user_id", profile.providerUserId)
    .maybeSingle();
  if (identityErr && (identityErr as { code?: string }).code === "PGRST205") {
    return { ok: false, error: "candidate_oauth_identities doesn't exist yet. Run the migrations." };
  }

  if (identity) {
    const { data: account } = await c
      .from("candidate_users")
      .select("id, email, name, status")
      .eq("id", identity.candidate_id)
      .maybeSingle();
    const row = account as CandidateAccountRow | null;
    if (!row) return { ok: false, error: "That account no longer exists." };
    if (row.status !== "active") return { ok: false, error: "This account has been disabled." };
    return { ok: true, session: { id: row.id, email: row.email, name: row.name } };
  }

  // 2. First time for this identity — does its verified email already have an account?
  let account: CandidateAccountRow | null = null;
  if (profile.email) {
    const { data } = await c
      .from("candidate_users")
      .select("id, email, name, status")
      .eq("email", profile.email.toLowerCase())
      .maybeSingle();
    account = (data as CandidateAccountRow | null) ?? null;
  }

  // 3. Neither — create the account. No password; this candidate signs in
  // through this provider from now on (or links a second one the same way).
  if (!account) {
    if (!profile.email) {
      return {
        ok: false,
        error: `${provider} didn't share a verified email, so there's nothing to create or match an account with.`,
      };
    }
    const { data: created, error: createErr } = await c
      .from("candidate_users")
      .insert({ name: profile.name.slice(0, 200), email: profile.email.toLowerCase(), password_hash: null })
      .select("id, email, name, status")
      .single();
    if (createErr || !created) return { ok: false, error: "Couldn't create an account from that sign-in — try again." };
    account = created as CandidateAccountRow;
  }

  if (account.status !== "active") return { ok: false, error: "This account has been disabled." };

  const { error: linkErr } = await c.from("candidate_oauth_identities").insert({
    candidate_id: account.id,
    provider,
    provider_user_id: profile.providerUserId,
    email_at_link: profile.email,
  });
  // A unique-violation here means a concurrent request linked the same
  // identity a moment ago (double-click, double tab) — not a real failure,
  // the account this resolves to is still the right one.
  if (linkErr && (linkErr as { code?: string }).code !== "23505") {
    return { ok: false, error: "Signed in, but couldn't save the linked account — try again." };
  }

  return { ok: true, session: { id: account.id, email: account.email, name: account.name } };
}
