import "server-only";

// Composio: how a candidate connects a GitHub, GitLab or LinkedIn account,
// and how the app then reads that account on their behalf.
//
// A username typed into the profile shows only that an account exists. Here
// the candidate goes through the platform's own sign-in (hosted by Composio
// — this app never sees a password or a token), which does two things: it
// shows the account is theirs, and it leaves a connection the knowledge
// base is built and refreshed through (lib/profile/knowledge-connection.ts).
//
// The connection is kept for as long as the account stays linked, and
// deleted — tokens and all — when the candidate removes it from their
// profile, or links a different account in its place. Only read tools are
// ever run through it: nothing is posted, changed or deleted on the
// candidate's account.
//
// REST API v3.1, called directly: https://docs.composio.dev/reference
// COMPOSIO_API_URL exists so a check can point this at a stand-in.

const BASE = () => (process.env.COMPOSIO_API_URL || "https://backend.composio.dev/api/v3.1").replace(/\/+$/, "");

export type ConnectPlatform = "github" | "gitlab" | "linkedin";

export function isConnectPlatform(p: string): p is ConnectPlatform {
  return p === "github" || p === "gitlab" || p === "linkedin";
}

export function composioReady(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}

/** The tool that answers "who is signed in?" on each platform. */
const WHOAMI: Record<ConnectPlatform, string> = {
  github: "GITHUB_GET_THE_AUTHENTICATED_USER",
  gitlab: "GITLAB_GET_CURRENT_USER",
  linkedin: "LINKEDIN_GET_MY_INFO",
};

export class ComposioError extends Error {}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new ComposioError("Composio isn't configured — set COMPOSIO_API_KEY");
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { "x-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new ComposioError(`Composio: ${message}`);
  }
  return json;
}

// An auth config is Composio's per-platform sign-in setup, made once in the
// Composio dashboard (Auth Configs → Create, per toolkit). This app only
// looks them up: it doesn't create one, both because a project's API key is
// commonly read-only for auth configs and because which OAuth app and scopes
// a platform's sign-in uses is the project owner's decision.
// COMPOSIO_<PLATFORM>_AUTH_CONFIG_ID names one outright; otherwise the
// project's enabled config for that platform is used. The lookup is kept
// for a few minutes so a profile page doesn't ask Composio on every view.
const PLATFORMS: ConnectPlatform[] = ["github", "gitlab", "linkedin"];
const LOOKUP_TTL_MS = 5 * 60_000;
let lookup: { at: number; ids: Partial<Record<ConnectPlatform, string>> } | null = null;

async function authConfigs(): Promise<Partial<Record<ConnectPlatform, string>>> {
  if (lookup && Date.now() - lookup.at < LOOKUP_TTL_MS) return lookup.ids;
  const ids: Partial<Record<ConnectPlatform, string>> = {};
  for (const platform of PLATFORMS) {
    const fixed = process.env[`COMPOSIO_${platform.toUpperCase()}_AUTH_CONFIG_ID`];
    if (fixed) ids[platform] = fixed;
  }
  const missing = PLATFORMS.filter((p) => !ids[p]);
  if (missing.length > 0) {
    const listed = await call("GET", `/auth_configs?toolkit_slug=${missing.join(",")}&limit=100`);
    for (const config of (listed?.items ?? []) as any[]) {
      const slug = String(config?.toolkit?.slug ?? "").toLowerCase();
      if (isConnectPlatform(slug) && !ids[slug] && config.id && config.status !== "DISABLED") ids[slug] = config.id;
    }
  }
  lookup = { at: Date.now(), ids };
  return ids;
}

/**
 * The platforms a candidate can sign in to right now: those with an auth
 * config in the Composio project. Empty when Composio isn't configured or
 * can't be reached — the profile then offers linking by username only.
 */
export async function connectablePlatforms(): Promise<ConnectPlatform[]> {
  if (!composioReady()) return [];
  try {
    const ids = await authConfigs();
    return PLATFORMS.filter((p) => !!ids[p]);
  } catch (err) {
    console.error("composio: couldn't list auth configs:", err);
    return [];
  }
}

async function authConfigId(platform: ConnectPlatform): Promise<string> {
  const id = (await authConfigs())[platform];
  if (!id) throw new ComposioError(`Composio: no auth config exists for ${platform} — create one in the Composio dashboard`);
  return id;
}

/** Starts a sign-in: where to send the candidate, and the connection that will exist once they finish. */
export async function startConnection(platform: ConnectPlatform, candidateId: string, callbackUrl: string): Promise<{ redirectUrl: string; connectedAccountId: string }> {
  const link = await call("POST", "/connected_accounts/link", {
    auth_config_id: await authConfigId(platform),
    user_id: candidateId,
    callback_url: callbackUrl,
  });
  if (!link?.redirect_url || !link?.connected_account_id) throw new ComposioError("Composio didn't return a sign-in link");
  return { redirectUrl: link.redirect_url, connectedAccountId: link.connected_account_id };
}

export interface ConnectedIdentity {
  /** The account's username on the platform. Empty for LinkedIn, which doesn't give one. */
  handle: string;
  /** The account holder's display name, when the platform gave one. */
  name: string;
}

/** The first string found under any of `keys`, looking a few levels into a tool's result. */
function pick(value: any, keys: string[], depth = 0): string {
  if (!value || typeof value !== "object" || depth > 4) return "";
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  for (const inner of Object.values(value)) {
    const found = pick(inner, keys, depth + 1);
    if (found) return found;
  }
  return "";
}

/**
 * Confirms a finished sign-in and says whose account it is.
 *
 * The connection must be active, for this platform, and made for this
 * candidate — all three are read back from Composio, not taken from the
 * browser. Returns null when the sign-in wasn't completed.
 */
export async function identityOf(platform: ConnectPlatform, candidateId: string, connectedAccountId: string): Promise<ConnectedIdentity | null> {
  const account = await call("GET", `/connected_accounts/${encodeURIComponent(connectedAccountId)}`);
  if (account?.status !== "ACTIVE") return null;
  if (account.user_id !== candidateId) throw new ComposioError("That sign-in belongs to a different account here.");
  if (String(account.toolkit?.slug ?? "").toLowerCase() !== platform) throw new ComposioError("That sign-in was for a different platform.");

  const result = await call("POST", `/tools/execute/${WHOAMI[platform]}`, { user_id: candidateId, connected_account_id: connectedAccountId, arguments: {} });
  if (!result?.successful) throw new ComposioError(`Composio: ${result?.error || "couldn't read the signed-in account"}`);

  if (platform === "linkedin") {
    const name = pick(result.data, ["name", "localizedName"]) || [pick(result.data, ["given_name", "localizedFirstName"]), pick(result.data, ["family_name", "localizedLastName"])].filter(Boolean).join(" ");
    if (!name) throw new ComposioError("LinkedIn didn't say who is signed in.");
    return { handle: "", name };
  }
  const handle = pick(result.data, platform === "github" ? ["login"] : ["username"]);
  if (!handle) throw new ComposioError(`${platform === "github" ? "GitHub" : "GitLab"} didn't say who is signed in.`);
  return { handle, name: pick(result.data, ["name"]) };
}

/**
 * Runs one of a platform's tools through the candidate's connection and
 * returns its `data`. Throws when the tool reports failure — a connection
 * the candidate has since revoked on the platform's side fails here.
 */
export async function runTool(tool: string, candidateId: string, connectedAccountId: string, args: Record<string, unknown>): Promise<any> {
  const result = await call("POST", `/tools/execute/${tool}`, { user_id: candidateId, connected_account_id: connectedAccountId, arguments: args });
  if (!result?.successful) throw new ComposioError(`Composio: ${tool} — ${result?.error || "no result"}`);
  return result.data;
}

/** Ends a connection: deletes it and the tokens Composio holds for it. Never throws. */
export async function endConnection(connectedAccountId: string): Promise<boolean> {
  try {
    await call("DELETE", `/connected_accounts/${encodeURIComponent(connectedAccountId)}`);
    return true;
  } catch (err) {
    console.error("composio: couldn't delete a connection:", err);
    return false;
  }
}
