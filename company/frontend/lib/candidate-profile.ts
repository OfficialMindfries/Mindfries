import "server-only";
import { db } from "./supabase";

// The candidate's own profile, as the hiring team sees it beside the report:
// what they wrote about themselves, their resume and what was read from it,
// and what their linked code accounts show publicly.
//
// It is the candidate's account in the shared database (candidate_users,
// candidate_knowledge — written by candidate/frontend), found by the email
// the company invited. Callers reach this only after
// getApplicationForCompany() has established that the application belongs
// to the signed-in company; the email comes from that row, never from the
// request.
//
// Each part says where it came from, because they are not the same kind of
// claim: the identity is the candidate's own words, the resume fields are a
// pattern match over their resume, and the code accounts are public data
// about a username they typed.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ProfileLink {
  platform: "github" | "gitlab" | "linkedin" | "portfolio";
  label: string;
  url: string;
}

export interface ProfileProject {
  name: string;
  description: string;
  language: string | null;
  stars: number;
  url: string;
  updatedAt: string | null;
}

export interface ProfileCodeAccount {
  source: "github" | "gitlab";
  handle: string;
  /** True only once the candidate has signed in to the account to show it is theirs. */
  verified: boolean;
  fetchedAt: string;
  profileUrl: string;
  memberSince: string | null;
  languages: Array<{ name: string; projects: number }>;
  projects: ProfileProject[];
  projectCount: number;
  activity: { lastActiveAt: string | null; since: string | null; pushes: number; pullRequests: number; reviews: number; issues: number } | null;
}

export interface CandidateProfile {
  name: string;
  /** Null until someone has checked the address — see email_verified_at in 0018. */
  emailVerifiedAt: string | null;
  headline: string;
  location: string;
  bio: string;
  noticePeriod: string;
  openTo: string[];
  updatedAt: string | null;
  links: ProfileLink[];
  resume: {
    /** A link to the file that works for an hour, or null if it couldn't be signed. */
    url: string | null;
    fileName: string;
    /** Technologies the resume names. Empty when nothing could be read from the file. */
    skills: string[];
    years: { from: number; to: number } | null;
    readable: boolean;
  } | null;
  codeAccounts: ProfileCodeAccount[];
}

const LINK_URL: Record<ProfileLink["platform"], (v: string) => string> = {
  github: (v) => `https://github.com/${encodeURIComponent(v)}`,
  gitlab: (v) => `https://gitlab.com/${encodeURIComponent(v)}`,
  linkedin: (v) => `https://www.linkedin.com/in/${encodeURIComponent(v)}`,
  portfolio: (v) => v,
};
const LINK_LABEL: Record<ProfileLink["platform"], string> = { github: "GitHub", gitlab: "GitLab", linkedin: "LinkedIn", portfolio: "Portfolio" };

/** Only ever an http(s) link — a stored portfolio value is the candidate's input. */
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function toLinks(raw: any): ProfileLink[] {
  const out: ProfileLink[] = [];
  for (const platform of ["github", "gitlab", "linkedin", "portfolio"] as const) {
    const value = raw?.[platform]?.value;
    if (typeof value !== "string" || !value) continue;
    const url = safeUrl(LINK_URL[platform](value));
    if (url) out.push({ platform, label: LINK_LABEL[platform], url });
  }
  return out;
}

function toCodeAccount(r: any): ProfileCodeAccount | null {
  const k = r.payload;
  if (!k || typeof k !== "object") return null;
  const profileUrl = safeUrl(String(k.profile?.profileUrl ?? ""));
  if (!profileUrl) return null;
  return {
    source: r.source,
    handle: r.handle,
    verified: !!r.verified,
    fetchedAt: r.fetched_at,
    profileUrl,
    memberSince: k.profile?.memberSince ?? null,
    languages: Array.isArray(k.languages) ? k.languages : [],
    projects: (Array.isArray(k.projects) ? k.projects : [])
      .map((p: any) => ({ ...p, url: safeUrl(String(p.url ?? "")) }))
      .filter((p: any) => p.url),
    projectCount: Number(k.projectCount) || 0,
    activity: k.activity ?? null,
  };
}

/**
 * The profile behind an invited email, or null when that person has no
 * candidate account yet (invited, hasn't signed up) or Supabase isn't wired.
 */
export async function getCandidateProfile(candidateEmail: string): Promise<CandidateProfile | null> {
  const c = db();
  const email = candidateEmail.trim().toLowerCase();
  if (!c || !email) return null;

  const { data: row } = await c
    .from("candidate_users")
    .select("id, name, role, location, bio, notice_period, open_to, resume_path, resume_parsed, links, profile_updated_at, email_verified_at")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (!row) return null;
  const r = row as any;

  const [{ data: knowledge }, signed] = await Promise.all([
    c.from("candidate_knowledge").select("source, handle, verified, payload, fetched_at").eq("candidate_id", r.id).order("source"),
    r.resume_path ? c.storage.from("resumes").createSignedUrl(r.resume_path, 3600) : Promise.resolve(null),
  ]);

  const parsed = r.resume_parsed as { skills?: string[]; years?: { from: number; to: number } } | null;

  return {
    name: r.name ?? "",
    emailVerifiedAt: r.email_verified_at ?? null,
    headline: r.role ?? "",
    location: r.location ?? "",
    bio: r.bio ?? "",
    noticePeriod: r.notice_period ?? "",
    openTo: r.open_to ?? [],
    updatedAt: r.profile_updated_at ?? null,
    links: toLinks(r.links),
    resume: r.resume_path
      ? {
          url: signed?.data?.signedUrl ?? null,
          // Stored as "<candidate id>/<timestamp>-<name>".
          fileName: String(r.resume_path).split("/").pop()?.replace(/^\d+-/, "") || "Resume",
          skills: Array.isArray(parsed?.skills) ? parsed.skills : [],
          years: parsed?.years ?? null,
          readable: !!parsed,
        }
      : null,
    codeAccounts: (knowledge ?? []).map(toCodeAccount).filter((a): a is ProfileCodeAccount => a !== null),
  };
}
