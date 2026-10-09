import "server-only";
import { runTool, type ConnectPlatform } from "../composio";
import { addPrivateProjects, shapeGithub, shapeGitlab, type Knowledge } from "./knowledge-shape";
import { readAccount } from "./knowledge";

/**
 * Building the knowledge base through the candidate's own connection
 * (Composio), rather than from the platform's public API.
 *
 * What the connection adds over a public read: it is the candidate's
 * account for certain, and it can see their private work. Private work is
 * used with restraint. A private repository very often belongs to an
 * employer, and its name is not the candidate's to hand to a third party —
 * so private projects are *counted*, and their languages go into the
 * language totals, but their names, descriptions and links are never
 * stored. Everything listed by name is public.
 *
 * Each tool's result is unwrapped tolerantly (`listIn`, `objectWith`),
 * because a tool wraps the platform's JSON in an envelope of its own. If a
 * tool fails or answers with nothing usable, that part falls back to the
 * public read for the same username — the knowledge base is then smaller,
 * not wrong, and `via` records which it was.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The list inside a tool's result: the result itself, or the first array of objects found a few levels in. */
export function listIn(data: any, depth = 0): any[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || depth > 3) return null;
  for (const key of ["details", "data", "items", "repositories", "projects", "events", "response_data", "results"]) {
    const found = listIn(data[key], depth + 1);
    if (found) return found;
  }
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && (value.length === 0 || typeof value[0] === "object")) return value;
  }
  return null;
}

/** The object inside a tool's result that has `key` — the platform's own record, whatever it is wrapped in. */
export function objectWith(data: any, key: string, depth = 0): any | null {
  if (!data || typeof data !== "object" || depth > 4) return null;
  if (!Array.isArray(data) && typeof data[key] === "string") return data;
  for (const value of Object.values(data)) {
    const found = objectWith(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}

async function github(candidateId: string, connectionId: string): Promise<Knowledge> {
  const run = (tool: string, args: Record<string, unknown> = {}) => runTool(tool, candidateId, connectionId, args);

  const user = objectWith(await run("GITHUB_GET_THE_AUTHENTICATED_USER"), "login");
  if (!user) throw new Error("GitHub didn't say who is signed in.");

  const [reposRaw, eventsRaw] = await Promise.all([
    run("GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", { type: "owner", sort: "pushed", direction: "desc", per_page: 100 }).catch(() => null),
    run("GITHUB_LIST_EVENTS_FOR_THE_AUTHENTICATED_USER", { username: user.login, per_page: 100 }).catch(() => null),
  ]);
  const repos = listIn(reposRaw);
  if (!repos) throw new Error("GitHub didn't list the account's repositories.");

  const isPrivate = (r: any) => r?.private === true || (typeof r?.visibility === "string" && r.visibility !== "public");
  const k = shapeGithub(user, repos.filter((r) => !isPrivate(r)), listIn(eventsRaw));
  return addPrivateProjects(
    k,
    repos.filter((r) => isPrivate(r) && !r.fork).map((r) => (typeof r.language === "string" ? r.language : null)),
  );
}

async function gitlab(candidateId: string, connectionId: string): Promise<Knowledge> {
  const run = (tool: string, args: Record<string, unknown> = {}) => runTool(tool, candidateId, connectionId, args);

  const user = objectWith(await run("GITLAB_GET_CURRENT_USER"), "username");
  if (!user) throw new Error("GitLab didn't say who is signed in.");

  const projects = listIn(await run("GITLAB_GET_PROJECTS", { owned: true, order_by: "last_activity_at", sort: "desc", per_page: 100 }));
  if (!projects) throw new Error("GitLab didn't list the account's projects.");

  const isPrivate = (p: any) => typeof p?.visibility === "string" && p.visibility !== "public";
  const own = projects.filter((p) => p && !p.forked_from_project);
  const languages: Record<string, Record<string, number>> = {};
  await Promise.all(
    own.slice(0, 20).map(async (p) => {
      const shares = await run("GITLAB_GET_PROJECT_LANGUAGES", { id: String(p.id) }).catch(() => null);
      // The languages answer is a flat { name: share } object, possibly wrapped once.
      const flat = shares && typeof shares === "object" && Object.values(shares).every((v) => typeof v === "number") ? shares : (shares?.details ?? shares?.data ?? shares?.response_data);
      if (flat && typeof flat === "object" && !Array.isArray(flat) && Object.values(flat).every((v) => typeof v === "number")) languages[String(p.id)] = flat;
    }),
  );
  const mainLanguage = (p: any): string | null => {
    const top = Object.entries(languages[String(p.id)] ?? {}).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  };

  // Composio's GitLab toolkit has no tool for a user's events, so recent
  // activity comes from the public API for the same, now confirmed, account.
  const events = await publicGitlabEvents(user.id).catch(() => null);

  const k = shapeGitlab(user, projects.filter((p) => !isPrivate(p)), languages, events);
  return addPrivateProjects(k, own.filter(isPrivate).map(mainLanguage));
}

async function publicGitlabEvents(userId: unknown): Promise<any[] | null> {
  const res = await fetch(`https://gitlab.com/api/v4/users/${encodeURIComponent(String(userId))}/events?per_page=100`, {
    headers: { Accept: "application/json", "User-Agent": "Mindfries-Candidate-App/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const body = res.ok ? await res.json().catch(() => null) : null;
  return Array.isArray(body) ? body : null;
}

/**
 * The knowledge base for a connected GitHub or GitLab account. Falls back
 * to the public read for `handle` when the connection can't answer.
 */
export async function readThroughConnection(platform: Exclude<ConnectPlatform, "linkedin">, candidateId: string, connectionId: string, handle: string): Promise<Knowledge> {
  try {
    const k = platform === "github" ? await github(candidateId, connectionId) : await gitlab(candidateId, connectionId);
    return { ...k, via: "connection" };
  } catch (err) {
    console.error(`knowledge: reading ${platform} through the connection failed, using the public profile instead:`, err);
    return { ...(await readAccount(platform, handle)), via: "public" };
  }
}

export interface LinkedInProfile {
  name: string;
  headline?: string;
  pictureUrl?: string;
  /** The member's own profile address, when LinkedIn gives one (it usually doesn't to a basic app). */
  profileUrl?: string;
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** What LinkedIn says about the signed-in member. Only what a hiring team would read: no email, no ids. */
export async function readLinkedIn(candidateId: string, connectionId: string): Promise<LinkedInProfile | null> {
  const data = await runTool("LINKEDIN_GET_MY_INFO", candidateId, connectionId, {}).catch(() => null);
  const record = objectWith(data, "name") ?? objectWith(data, "given_name") ?? objectWith(data, "localizedFirstName");
  if (!record) return null;
  const name = text(record.name, 200) ?? [record.given_name ?? record.localizedFirstName, record.family_name ?? record.localizedLastName].filter((p) => typeof p === "string" && p).join(" ");
  if (!name) return null;
  const vanity = text(record.vanityName, 120);
  const picture = text(record.picture, 600);
  return {
    name,
    headline: text(record.headline ?? record.localizedHeadline, 300),
    pictureUrl: picture && /^https:\/\//.test(picture) ? picture : undefined,
    profileUrl: vanity && /^[a-zA-Z0-9\-_%]{3,100}$/.test(vanity) ? `https://www.linkedin.com/in/${vanity}` : undefined,
  };
}
