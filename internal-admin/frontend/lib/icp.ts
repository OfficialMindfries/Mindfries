// Daily company discovery. A company actively hiring software engineers is the
// exact ICP for a technical-interview platform, so we mine free job boards
// (no API key, no lead-gen bill) and rank each hiring company by fit.
//
// ponytail: two free sources + a heuristic score. Swap in an enrichment API
// (Apollo/Clearbit) later behind the same RawLead shape if fit accuracy matters.

export interface RawLead {
  company: string;
  domain: string | null;
  roleTitle: string | null;
  location: string | null;
  tags: string[];
  source: string;
  sourceUrl: string | null;
}

const ENG_KEYWORDS = [
  "engineer", "developer", "software", "backend", "back-end", "frontend",
  "front-end", "fullstack", "full-stack", "full stack", "devops", "platform",
  "sre", "python", "node", "react", "typescript", "javascript", "golang",
  "rust", "kubernetes", "infrastructure", "data engineer", "programmer",
];
const SENIOR_KEYWORDS = ["senior", "lead", "staff", "principal", "head of", "sr"];

// Word-boundary match so "go"/"api" don't hit inside "good"/"Airport".
const hits = (text: string, words: string[]) =>
  words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));

// 0..100 ICP fit. Pure — the one piece with real logic, so it has a self-check
// (icp.test.mts). The engineering signal must come from the ROLE TITLE (job
// boards tag noisily); tags are only a weak secondary. Higher = better company
// to pitch technical hiring to.
export function scoreLead(l: RawLead): number {
  const title = (l.roleTitle ?? "").toLowerCase();
  const tagText = l.tags.join(" ").toLowerCase();
  let s = 0;
  if (hits(title, ENG_KEYWORDS)) s += 45;        // title says engineering → strong
  else if (hits(tagText, ENG_KEYWORDS)) s += 20; // only tags hint tech → weak, filtered out
  if (hits(title, SENIOR_KEYWORDS)) s += 20;     // senior roles = harder hiring
  s += Math.min(10, l.tags.length * 2);
  if (l.location) s += 5;
  if (l.domain) s += 10;                          // we can actually reach them
  return Math.min(100, s);
}

// Collapse many job posts down to one row per company, keeping the best score.
export function dedupeByCompany(rows: (RawLead & { score: number })[]) {
  const best = new Map<string, RawLead & { score: number }>();
  for (const r of rows) {
    const key = r.company.trim().toLowerCase();
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || r.score > prev.score) best.set(key, r);
  }
  return [...best.values()];
}

async function safeFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MindfriesTracker/1.0 (+https://mindfries.com)", Accept: "application/json" },
    // Route handler is dynamic; never cache the daily crawl.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// RemoteOK: all-remote tech jobs. First array element is a legal notice.
async function fetchRemoteOK(): Promise<RawLead[]> {
  const data = (await safeFetchJson("https://remoteok.com/api")) as Record<string, unknown>[];
  return data
    .filter((j) => j && typeof j.company === "string")
    .map((j) => ({
      company: String(j.company),
      domain: null,
      roleTitle: (j.position as string) ?? null,
      location: (j.location as string) || "Remote",
      tags: Array.isArray(j.tags) ? (j.tags as string[]).slice(0, 8) : [],
      source: "remoteok",
      sourceUrl: (j.url as string) ?? null,
    }));
}

// Arbeitnow: open job-board API, broad set — we filter to eng fit via score.
async function fetchArbeitnow(): Promise<RawLead[]> {
  const body = (await safeFetchJson("https://www.arbeitnow.com/api/job-board-api")) as { data?: Record<string, unknown>[] };
  return (body.data ?? [])
    .filter((j) => j && typeof j.company_name === "string")
    .map((j) => ({
      company: String(j.company_name),
      domain: null,
      roleTitle: (j.title as string) ?? null,
      location: (j.location as string) ?? null,
      tags: Array.isArray(j.tags) ? (j.tags as string[]).slice(0, 8) : [],
      source: "arbeitnow",
      sourceUrl: (j.url as string) ?? null,
    }));
}

const SOURCES = [fetchRemoteOK, fetchArbeitnow];

// Run every source (one failing doesn't sink the crawl), score, dedupe, and
// keep only companies that clear a minimum engineering-fit bar.
export async function discover(minScore = 45): Promise<(RawLead & { score: number })[]> {
  const settled = await Promise.allSettled(SOURCES.map((f) => f()));
  const raw = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const scored = raw.map((r) => ({ ...r, score: scoreLead(r) }));
  return dedupeByCompany(scored)
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
