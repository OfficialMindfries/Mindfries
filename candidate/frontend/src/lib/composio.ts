import "server-only";

// Composio, used for one thing: letting a candidate prove a GitHub, GitLab
// or LinkedIn account is theirs by signing in to it.
//
// A username typed into the profile shows only that an account exists.
// Here the candidate goes through the platform's own sign-in (hosted by
// Composio — this app never sees a password or a token), and afterwards
// Composio is asked one question on their behalf: "who is signed in?". The
// answer is the account that is theirs.
//
// The connection is then deleted (see app/api/connect/[platform]/callback).
// Composio's managed sign-in asks the platform for far more than identity —
// for GitHub, access to repositories — and nothing here needs any of it
// once the question is answered: the knowledge base is read from public
// data. So the access is given back as soon as it has done its job, rather
// than left standing in a third party's vault.
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

// An auth config is Composio's per-platform sign-in setup. One is needed
// per platform, once per Composio project — so it is found (or, the first
// time, created with Composio's own managed OAuth app) and remembered for
// the life of this server process. COMPOSIO_<PLATFORM>_AUTH_CONFIG_ID names
// one outright, for a project that has set up its own OAuth app there.
const authConfigs = new Map<ConnectPlatform, string>();

async function authConfigId(platform: ConnectPlatform): Promise<string> {
  const fixed = process.env[`COMPOSIO_${platform.toUpperCase()}_AUTH_CONFIG_ID`];
  if (fixed) return fixed;
  const known = authConfigs.get(platform);
  if (known) return known;

  const listed = await call("GET", `/auth_configs?toolkit_slug=${platform}&limit=20`);
  const usable = (listed?.items ?? []).find((c: any) => c?.id && c.status !== "DISABLED" && String(c.toolkit?.slug ?? "").toLowerCase() === platform);
  let id: string | undefined = usable?.id;
  if (!id) {
    const created = await call("POST", "/auth_configs", { toolkit: { slug: platform }, auth_config: { type: "use_composio_managed_auth" } });
    id = created?.auth_config?.id;
  }
  if (!id) throw new ComposioError(`Composio: no sign-in is set up for ${platform}`);
  authConfigs.set(platform, id);
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

/** Gives the access back: deletes the connection and the tokens Composio holds for it. Never throws. */
export async function endConnection(connectedAccountId: string): Promise<boolean> {
  try {
    await call("DELETE", `/connected_accounts/${encodeURIComponent(connectedAccountId)}`);
    return true;
  } catch (err) {
    console.error("composio: couldn't delete a connection after use:", err);
    return false;
  }
}
