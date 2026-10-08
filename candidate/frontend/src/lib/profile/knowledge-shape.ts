/**
 * Turning what GitHub and GitLab say about an account into the candidate's
 * knowledge base: the projects they've published, the languages those are
 * written in, and how recently they've been active.
 *
 * Pure — the fetching is in knowledge.ts — so Node can check it against
 * recorded responses (knowledge-shape.check.ts).
 *
 * Everything here is public data about a username. It describes the
 * account; whether the account belongs to the candidate is a separate
 * question, answered by `verified` on the stored row.
 */

export type KnowledgeSource = "github" | "gitlab";

export interface KnowledgeProject {
  name: string;
  description: string;
  language: string | null;
  stars: number;
  url: string;
  /** ISO time of the last push or activity. */
  updatedAt: string | null;
}

export interface KnowledgeActivity {
  /** ISO time of the most recent public event, or null when there are none. */
  lastActiveAt: string | null;
  /** The window the counts below cover: from this ISO time to `lastActiveAt`. */
  since: string | null;
  events: number;
  pushes: number;
  pullRequests: number;
  reviews: number;
  issues: number;
}

export interface Knowledge {
  source: KnowledgeSource;
  handle: string;
  profile: {
    name: string;
    avatarUrl?: string;
    profileUrl: string;
    bio?: string;
    publicRepos?: number;
    followers?: number;
    /** ISO time the account was created. */
    memberSince?: string;
  };
  /** Languages across the candidate's own (non-fork) projects, most projects first. */
  languages: Array<{ name: string; projects: number }>;
  /** Their own projects, most recently worked on first. */
  projects: KnowledgeProject[];
  /** How many projects there are in all; `projects` holds at most MAX_PROJECTS of them. */
  projectCount: number;
  /** Null when the platform wouldn't say (GitLab hides events for some accounts). */
  activity: KnowledgeActivity | null;
}

export const MAX_PROJECTS = 12;

/* eslint-disable @typescript-eslint/no-explicit-any */

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function tally(names: Array<string | null>): Knowledge["languages"] {
  const counts = new Map<string, number>();
  for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, projects]) => ({ name, projects }))
    .sort((a, b) => b.projects - a.projects || a.name.localeCompare(b.name));
}

function activity(times: string[], counts: Omit<KnowledgeActivity, "lastActiveAt" | "since" | "events">): KnowledgeActivity {
  const sorted = times.filter(Boolean).sort();
  return {
    lastActiveAt: sorted.at(-1) ?? null,
    since: sorted[0] ?? null,
    events: sorted.length,
    ...counts,
  };
}

/**
 * `repos` is GET /users/:u/repos, `events` is GET /users/:u/events/public.
 * Forks are left out of projects and languages: a fork says what someone
 * clicked, not what they wrote.
 */
export function shapeGithub(user: any, repos: any[], events: any[] | null): Knowledge {
  const handle = str(user?.login, 100);
  const own = (Array.isArray(repos) ? repos : []).filter((r) => r && !r.fork);
  own.sort((a, b) => String(b.pushed_at ?? "").localeCompare(String(a.pushed_at ?? "")));

  const count = (type: string) => (events ?? []).filter((e) => e?.type === type).length;

  return {
    source: "github",
    handle,
    profile: {
      name: str(user?.name) || handle,
      avatarUrl: str(user?.avatar_url, 500) || undefined,
      profileUrl: str(user?.html_url, 500) || `https://github.com/${handle}`,
      bio: str(user?.bio, 500) || undefined,
      publicRepos: num(user?.public_repos),
      followers: num(user?.followers),
      memberSince: str(user?.created_at, 40) || undefined,
    },
    languages: tally(own.map((r) => (typeof r.language === "string" ? r.language : null))),
    projects: own.slice(0, MAX_PROJECTS).map((r) => ({
      name: str(r.name, 120),
      description: str(r.description),
      language: typeof r.language === "string" ? r.language : null,
      stars: num(r.stargazers_count),
      url: str(r.html_url, 500),
      updatedAt: str(r.pushed_at, 40) || null,
    })),
    projectCount: own.length,
    activity: events
      ? activity(
          events.map((e) => str(e?.created_at, 40)),
          {
            pushes: count("PushEvent"),
            pullRequests: count("PullRequestEvent"),
            reviews: count("PullRequestReviewEvent"),
            issues: count("IssuesEvent"),
          },
        )
      : null,
  };
}

/**
 * `projects` is GET /users/:id/projects, `languagesByProject` maps a project
 * id to its GET /projects/:id/languages answer (GitLab has no single
 * "language" field on a project), `events` is GET /users/:id/events.
 */
export function shapeGitlab(user: any, projects: any[], languagesByProject: Record<string, Record<string, number>>, events: any[] | null): Knowledge {
  const handle = str(user?.username, 255);
  const own = (Array.isArray(projects) ? projects : []).filter((p) => p && !p.forked_from_project);
  own.sort((a, b) => String(b.last_activity_at ?? "").localeCompare(String(a.last_activity_at ?? "")));

  /** A project's main language: the one with the largest share. */
  const mainLanguage = (id: unknown): string | null => {
    const shares = languagesByProject[String(id)];
    if (!shares) return null;
    const top = Object.entries(shares).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  };

  const action = (name: string, target?: string) =>
    (events ?? []).filter((e) => str(e?.action_name, 40).startsWith(name) && (!target || e?.target_type === target)).length;

  return {
    source: "gitlab",
    handle,
    profile: {
      name: str(user?.name) || handle,
      avatarUrl: str(user?.avatar_url, 500) || undefined,
      profileUrl: str(user?.web_url, 500) || `https://gitlab.com/${handle}`,
      bio: str(user?.bio, 500) || undefined,
      memberSince: str(user?.created_at, 40) || undefined,
    },
    languages: tally(own.map((p) => mainLanguage(p.id))),
    projects: own.slice(0, MAX_PROJECTS).map((p) => ({
      name: str(p.name, 120),
      description: str(p.description),
      language: mainLanguage(p.id),
      stars: num(p.star_count),
      url: str(p.web_url, 500),
      updatedAt: str(p.last_activity_at, 40) || null,
    })),
    projectCount: own.length,
    activity: events
      ? activity(
          events.map((e) => str(e?.created_at, 40)),
          {
            pushes: action("pushed"),
            pullRequests: action("opened", "MergeRequest"),
            reviews: action("approved") + action("commented on", "MergeRequest"),
            issues: action("opened", "Issue"),
          },
        )
      : null,
  };
}

/** The few fields the profile tile shows, kept on the link itself. */
export function statsOf(k: Knowledge) {
  return {
    name: k.profile.name,
    avatarUrl: k.profile.avatarUrl,
    publicRepos: k.profile.publicRepos,
    followers: k.profile.followers,
    profileUrl: k.profile.profileUrl,
  };
}
