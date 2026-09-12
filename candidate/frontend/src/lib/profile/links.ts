import { Briefcase, Globe } from "lucide-react";
import type { ComponentType } from "react";
import { GithubMark, GitlabMark } from "@/components/profile/BrandIcon";

/**
 * The four platforms a candidate can point a hiring team at — GitHub and
 * GitLab because they're the closest thing to a second, independent
 * evidence trail this product already believes in (real commit history,
 * not a claim); LinkedIn and a portfolio because that's what "understand
 * the candidate" means beyond code.
 *
 * GitHub and GitLab get something the other two can't: both APIs answer
 * unauthenticated, CORS-enabled requests for public profile data, so a
 * username here is checked against the real platform — verified in this
 * browser, confirmed against the real API, not just typed and trusted.
 * LinkedIn has no such public API and blocks this by policy, and an
 * arbitrary portfolio URL can't be assumed to allow cross-origin reads —
 * both stay "stored as a link", not "verified", and the UI says so.
 */

export type LinkPlatform = "github" | "gitlab" | "linkedin" | "portfolio";

export interface PlatformStats {
  name?: string;
  avatarUrl?: string;
  publicRepos?: number;
  followers?: number;
  profileUrl: string;
}

/** A definite "no such account" — distinct from a network hiccup, so the UI can tell you which one happened. */
export class NotFoundError extends Error {}

interface PlatformConfig {
  id: LinkPlatform;
  label: string;
  tint: string;
  icon: ComponentType<{ size?: number }>;
  placeholder: string;
  /** What this platform adds, shown once, so the ask isn't a bare text box. */
  pitch: string;
  /** True when a value here can be checked against the platform's own API. */
  live: boolean;
  /** Accepts a username or URL depending on the platform; returns the stored form or a reason it can't. */
  normalize(input: string): { ok: true; value: string } | { ok: false; error: string };
  profileUrl(value: string): string;
  fetchStats?(value: string): Promise<PlatformStats>;
}

const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITLAB_USERNAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;
const LINKEDIN_SLUG = /^[a-zA-Z0-9\-_%]{3,100}$/;

/** Strips a full profile URL down to the trailing username, if one was pasted instead of typed. */
function stripToLastSegment(input: string, host: RegExp): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (host.test(trimmed)) {
    const parts = trimmed.split("/");
    return parts[parts.length - 1] ?? trimmed;
  }
  return trimmed;
}

async function fetchGithub(username: string): Promise<PlatformStats> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) throw new NotFoundError(`No GitHub account named "${username}".`);
  if (!res.ok) throw new Error(`GitHub didn't answer (HTTP ${res.status}). Try again in a moment.`);
  const j = await res.json();
  return {
    name: j.name ?? j.login,
    avatarUrl: j.avatar_url,
    publicRepos: j.public_repos,
    followers: j.followers,
    profileUrl: j.html_url ?? `https://github.com/${username}`,
  };
}

async function fetchGitlab(username: string): Promise<PlatformStats> {
  const res = await fetch(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error(`GitLab didn't answer (HTTP ${res.status}). Try again in a moment.`);
  const rows = (await res.json()) as Array<{ name?: string; username: string; avatar_url?: string; web_url?: string }>;
  const user = rows[0];
  if (!user) throw new NotFoundError(`No GitLab account named "${username}".`);
  return {
    name: user.name ?? user.username,
    avatarUrl: user.avatar_url,
    profileUrl: user.web_url ?? `https://gitlab.com/${user.username}`,
  };
}

export const PLATFORMS: Record<LinkPlatform, PlatformConfig> = {
  github: {
    id: "github",
    label: "GitHub",
    tint: "#181717", // simple-icons' own brand hex for GitHub
    icon: GithubMark,
    placeholder: "your-username",
    pitch: "Real commit history — the same kind of evidence this workspace already collects.",
    live: true,
    normalize(input) {
      const v = stripToLastSegment(input, /github\.com/i);
      if (!v) return { ok: false, error: "Enter a GitHub username." };
      if (!GITHUB_USERNAME.test(v)) return { ok: false, error: "That doesn't look like a GitHub username." };
      return { ok: true, value: v };
    },
    profileUrl: (v) => `https://github.com/${v}`,
    fetchStats: fetchGithub,
  },
  gitlab: {
    id: "gitlab",
    label: "GitLab",
    tint: "#FC6D26", // simple-icons' own brand hex for GitLab
    icon: GitlabMark,
    placeholder: "your-username",
    pitch: "Same idea, for teams that ship on GitLab instead.",
    live: true,
    normalize(input) {
      const v = stripToLastSegment(input, /gitlab\.com/i);
      if (!v) return { ok: false, error: "Enter a GitLab username." };
      if (!GITLAB_USERNAME.test(v)) return { ok: false, error: "That doesn't look like a GitLab username." };
      return { ok: true, value: v };
    },
    profileUrl: (v) => `https://gitlab.com/${v}`,
    fetchStats: fetchGitlab,
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    tint: "#0A66C2",
    icon: Briefcase,
    placeholder: "linkedin.com/in/your-name",
    pitch: "Background and experience, in your own words.",
    // LinkedIn's API doesn't allow an unauthenticated browser to read a
    // public profile — that needs a signed-in LinkedIn app and a backend
    // token exchange, neither of which exists here yet. So this one is
    // stored as a link, not checked against anything.
    live: false,
    normalize(input) {
      const slug = stripToLastSegment(input, /linkedin\.com\/in/i);
      if (!slug) return { ok: false, error: "Enter your LinkedIn profile URL." };
      if (!LINKEDIN_SLUG.test(slug)) return { ok: false, error: "That doesn't look like a LinkedIn profile URL." };
      return { ok: true, value: slug };
    },
    profileUrl: (v) => `https://www.linkedin.com/in/${v}`,
  },
  portfolio: {
    id: "portfolio",
    label: "Portfolio",
    tint: "#1A3D63",
    icon: Globe,
    placeholder: "https://your-site.com",
    pitch: "Anything else worth a look — a site, a blog, a write-up.",
    // An arbitrary site can't be assumed to allow a cross-origin read the way
    // GitHub and GitLab's APIs explicitly do, so this stays a stored link too.
    live: false,
    normalize(input) {
      const trimmed = input.trim();
      if (!trimmed) return { ok: false, error: "Enter a URL." };
      const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        const u = new URL(withScheme);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
        return { ok: true, value: u.toString() };
      } catch {
        return { ok: false, error: "That doesn't look like a URL." };
      }
    },
    profileUrl: (v) => v,
  },
};

export const PLATFORM_ORDER: LinkPlatform[] = ["github", "gitlab", "linkedin", "portfolio"];
