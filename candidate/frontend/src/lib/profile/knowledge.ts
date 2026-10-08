import "server-only";
import { db } from "../supabase";
import { shapeGithub, shapeGitlab, type Knowledge, type KnowledgeSource } from "./knowledge-shape";

/**
 * Reading a linked GitHub or GitLab account and keeping what it says
 * (candidate_knowledge, 0018_candidate_account_and_knowledge.sql).
 *
 * This reads the public profile of the username the candidate entered. It
 * proves the account exists, not that it is theirs — the row is stored with
 * `verified: false`, and both the candidate's profile and the hiring team's
 * view say so. Proving ownership means the candidate signing in to that
 * account, which is what the Composio connection is for; nothing here
 * pretends to be that.
 */

/** No such account — a definite answer, unlike a platform that didn't respond. */
export class AccountNotFound extends Error {}

const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITLAB_USERNAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;

/** How many GitLab projects get a languages lookup — each is its own request. */
const GITLAB_LANGUAGE_LOOKUPS = 12;

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  return { status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
}

async function readGithub(username: string): Promise<Knowledge> {
  if (!GITHUB_USERNAME.test(username)) throw new AccountNotFound(`"${username}" isn't a GitHub username.`);
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "Mindfries-Candidate-App/1.0" };
  // A token raises GitHub's rate limit from 60 requests an hour to 5,000.
  if (process.env.GITHUB_PAT) headers.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
  const base = `https://api.github.com/users/${encodeURIComponent(username)}`;

  const user = await getJson(base, headers);
  if (user.status === 404) throw new AccountNotFound(`No GitHub account named "${username}".`);
  if (!user.body) throw new Error(`GitHub didn't answer (HTTP ${user.status}). Try again in a moment.`);

  const [repos, events] = await Promise.all([
    getJson(`${base}/repos?per_page=100&sort=pushed&type=owner`, headers),
    getJson(`${base}/events/public?per_page=100`, headers),
  ]);
  if (!Array.isArray(repos.body)) throw new Error(`GitHub didn't list the account's repositories (HTTP ${repos.status}). Try again in a moment.`);
  return shapeGithub(user.body, repos.body, Array.isArray(events.body) ? events.body : null);
}

async function readGitlab(username: string): Promise<Knowledge> {
  if (!GITLAB_USERNAME.test(username)) throw new AccountNotFound(`"${username}" isn't a GitLab username.`);
  const headers = { Accept: "application/json", "User-Agent": "Mindfries-Candidate-App/1.0" };
  const api = "https://gitlab.com/api/v4";

  const found = await getJson(`${api}/users?username=${encodeURIComponent(username)}`, headers);
  if (!Array.isArray(found.body)) throw new Error(`GitLab didn't answer (HTTP ${found.status}). Try again in a moment.`);
  const hit = found.body[0] as { id?: number } | undefined;
  if (!hit?.id) throw new AccountNotFound(`No GitLab account named "${username}".`);

  const [user, projects, events] = await Promise.all([
    getJson(`${api}/users/${hit.id}`, headers),
    getJson(`${api}/users/${hit.id}/projects?per_page=100&order_by=last_activity_at`, headers),
    getJson(`${api}/users/${hit.id}/events?per_page=100`, headers),
  ]);
  const list = Array.isArray(projects.body) ? (projects.body as Array<{ id: number; forked_from_project?: unknown }>) : [];

  const languages: Record<string, Record<string, number>> = {};
  await Promise.all(
    list
      .filter((p) => !p.forked_from_project)
      .slice(0, GITLAB_LANGUAGE_LOOKUPS)
      .map(async (p) => {
        const res = await getJson(`${api}/projects/${p.id}/languages`, headers).catch(() => null);
        if (res?.body && typeof res.body === "object") languages[String(p.id)] = res.body as Record<string, number>;
      }),
  );

  return shapeGitlab(user.body ?? hit, list, languages, Array.isArray(events.body) ? events.body : null);
}

export function isKnowledgeSource(platform: string): platform is KnowledgeSource {
  return platform === "github" || platform === "gitlab";
}

/** Reads the account from the platform. Throws AccountNotFound, or an Error when the platform didn't answer. */
export function readAccount(source: KnowledgeSource, handle: string): Promise<Knowledge> {
  return source === "github" ? readGithub(handle) : readGitlab(handle);
}

export interface StoredKnowledge {
  source: KnowledgeSource;
  handle: string;
  verified: boolean;
  fetchedAt: string;
  knowledge: Knowledge;
}

export async function storeKnowledge(candidateId: string, k: Knowledge): Promise<void> {
  const c = db();
  if (!c) return;
  // A fresh read of a typed username is never verified, whatever was there before.
  await c.from("candidate_knowledge").upsert({
    candidate_id: candidateId,
    source: k.source,
    handle: k.handle,
    verified: false,
    payload: k,
    fetched_at: new Date().toISOString(),
  });
}

export async function dropKnowledge(candidateId: string, source: KnowledgeSource): Promise<void> {
  const c = db();
  if (!c) return;
  await c.from("candidate_knowledge").delete().eq("candidate_id", candidateId).eq("source", source);
}

export async function listKnowledge(candidateId: string): Promise<StoredKnowledge[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("candidate_knowledge").select("source, handle, verified, payload, fetched_at").eq("candidate_id", candidateId).order("source");
  return (data ?? []).map((r) => ({
    source: r.source as KnowledgeSource,
    handle: r.handle as string,
    verified: !!r.verified,
    fetchedAt: r.fetched_at as string,
    knowledge: r.payload as Knowledge,
  }));
}
