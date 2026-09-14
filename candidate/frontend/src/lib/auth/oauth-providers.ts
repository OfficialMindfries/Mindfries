import "server-only";

// Real OAuth2 authorization-code flow for the four social buttons on the
// login page — no SDK, plain fetch, same "checked against the platform's own
// API" spirit as lib/profile/links.ts's GitHub/GitLab verification. Each
// provider is a registered OAuth app Mindfries controls; none of that exists
// here, so every provider honestly reports "not configured" (see
// isConfigured) until its CLIENT_ID/CLIENT_SECRET are set — the same
// honest-refusal pattern as OpenRouter/Daytona/Resend elsewhere in this repo.
//
// All four platforms speak close enough to the same OAuth2 dialect (RFC
// 6749 authorization-code grant, JSON token responses when asked for one)
// that one start route, one callback route, and one token-exchange function
// cover all of them — only the authorize URL, scope, and the shape of the
// profile response differ, which is what this file captures per provider.

export type OAuthProviderId = "google" | "github" | "gitlab" | "linkedin";

export interface OAuthProfile {
  /** The platform's own stable id for the account — never the email (see the migration's comment on why). */
  providerUserId: string;
  email: string | null;
  name: string;
}

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra query params the provider wants on the authorize step, beyond the standard ones. */
  extraAuthorizeParams?: Record<string, string>;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}

function clientId(env: string): string | undefined {
  return process.env[env]?.trim() || undefined;
}
function clientSecret(env: string): string | undefined {
  return process.env[env]?.trim() || undefined;
}

async function githubProfile(accessToken: string): Promise<OAuthProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mindfries-candidate-portal",
  };
  const res = await fetch("https://api.github.com/user", { headers });
  if (!res.ok) throw new Error(`GitHub didn't return a profile (HTTP ${res.status}).`);
  const j = (await res.json()) as { id: number; login: string; name?: string | null; email?: string | null };

  let email = j.email ?? null;
  if (!email) {
    // A GitHub account can keep its email private on the profile itself —
    // this is the same "ask the emails endpoint" step GitHub's own OAuth
    // docs describe, not a workaround for anything unusual.
    const emailRes = await fetch("https://api.github.com/user/emails", { headers });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null;
    }
  }
  return { providerUserId: String(j.id), email, name: j.name || j.login };
}

async function googleProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google didn't return a profile (HTTP ${res.status}).`);
  const j = (await res.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
  return { providerUserId: j.sub, email: j.email_verified ? (j.email ?? null) : null, name: j.name || j.email || "Google account" };
}

async function gitlabProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch("https://gitlab.com/api/v4/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GitLab didn't return a profile (HTTP ${res.status}).`);
  const j = (await res.json()) as { id: number; username: string; name?: string; email?: string; confirmed_at?: string | null };
  // GitLab only includes `email` for a confirmed address on this scope; an
  // unconfirmed account still authenticates but carries no usable email.
  return { providerUserId: String(j.id), email: j.confirmed_at ? (j.email ?? null) : null, name: j.name || j.username };
}

async function linkedinProfile(accessToken: string): Promise<OAuthProfile> {
  // LinkedIn's current sign-in product ("Sign In with LinkedIn using OpenID
  // Connect") exposes a standard OIDC userinfo endpoint — the older
  // /v2/me + /v2/emailAddress pair is the deprecated way to do this.
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`LinkedIn didn't return a profile (HTTP ${res.status}).`);
  const j = (await res.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
  return { providerUserId: j.sub, email: j.email_verified ? (j.email ?? null) : null, name: j.name || "LinkedIn account" };
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    extraAuthorizeParams: { access_type: "online", prompt: "select_account" },
    fetchProfile: googleProfile,
  },
  github: {
    id: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
    fetchProfile: githubProfile,
  },
  gitlab: {
    id: "gitlab",
    label: "GitLab",
    authorizeUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scope: "read_user",
    clientIdEnv: "GITLAB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITLAB_OAUTH_CLIENT_SECRET",
    fetchProfile: gitlabProfile,
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile email",
    clientIdEnv: "LINKEDIN_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_OAUTH_CLIENT_SECRET",
    fetchProfile: linkedinProfile,
  },
};

export const OAUTH_PROVIDER_ORDER: OAuthProviderId[] = ["google", "github", "gitlab", "linkedin"];

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, value);
}

/** True only once both the client id and secret are actually set — never partially "on". */
export function isConfigured(id: OAuthProviderId): boolean {
  const cfg = OAUTH_PROVIDERS[id];
  return !!clientId(cfg.clientIdEnv) && !!clientSecret(cfg.clientSecretEnv);
}

export function buildAuthorizeUrl(id: OAuthProviderId, opts: { redirectUri: string; state: string }): string {
  const cfg = OAUTH_PROVIDERS[id];
  const cid = clientId(cfg.clientIdEnv);
  if (!cid) throw new Error(`${cfg.label} isn't configured — set ${cfg.clientIdEnv}/${cfg.clientSecretEnv}.`);
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cid);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", opts.state);
  for (const [k, v] of Object.entries(cfg.extraAuthorizeParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Exchanges an authorization code for an access token. All four providers
 * accept the same form-encoded request shape and return JSON when asked
 * for it (GitHub needs the explicit `Accept` header or it falls back to a
 * query-string body) — one implementation covers all of them.
 */
export async function exchangeCode(id: OAuthProviderId, opts: { code: string; redirectUri: string }): Promise<string> {
  const cfg = OAUTH_PROVIDERS[id];
  const cid = clientId(cfg.clientIdEnv);
  const secret = clientSecret(cfg.clientSecretEnv);
  if (!cid || !secret) throw new Error(`${cfg.label} isn't configured.`);

  const body = new URLSearchParams({
    client_id: cid,
    client_secret: secret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || `${cfg.label} refused the sign-in (HTTP ${res.status}).`);
  }
  return json.access_token;
}
