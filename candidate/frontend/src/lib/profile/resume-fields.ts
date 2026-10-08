/**
 * Reading a few fields out of a resume's plain text.
 *
 * No DOM and no server imports, so the page can run it on the text it just
 * extracted, the server can run it again on what it stores, and Node can
 * check it (resume-fields.check.ts).
 *
 * These are pattern matches over the text, not a language model. They will
 * sometimes find nothing, or the wrong line — so nothing found here is ever
 * written into the candidate's profile without them choosing it, and what a
 * hiring team sees is labelled as read from the resume, not as a claim the
 * candidate made or Mindfries checked.
 */

export interface ResumeSuggestions {
  name?: string;
  role?: string;
  location?: string;
  bio?: string;
}

export interface ResumeFields extends ResumeSuggestions {
  /** Technologies named in the resume, most-mentioned first. */
  skills: string[];
  /** Profile links written in the resume, keyed by where they point. */
  links: { github?: string; gitlab?: string; linkedin?: string };
  /** Calendar years the resume mentions, earliest and latest — a rough span, not a measure of experience. */
  years?: { from: number; to: number };
}

/** The most resume text kept: enough for any real resume, a ceiling for anything that isn't one. */
export const MAX_RESUME_TEXT = 60_000;

const LOCATION_LINE = /^[A-Z][a-zA-Z.'\s]{1,30},\s*([A-Z][a-zA-Z\s]{1,20}|[A-Z]{2})$/;
const NAME_LINE = /^[A-Z][a-zA-Z.'-]+(\s+[A-Z][a-zA-Z.'-]+){1,3}$/;
const SECTION_HEADERS = /^(summary|profile|about|objective)\b/i;
const NEXT_SECTION_HEADER = /^(experience|work experience|employment|education|skills|projects|certifications|awards)\b/i;

export function suggestFieldsFromText(text: string): ResumeSuggestions {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const suggestions: ResumeSuggestions = {};

  // A resume's first few lines are conventionally name, then title, then
  // location — checked in order, each against its own shape, so a resume
  // that doesn't follow the convention just yields fewer suggestions rather
  // than a wrong one forced into place.
  const head = lines.slice(0, 6);
  const nameLine = head.find((l) => NAME_LINE.test(l) && l.split(/\s+/).length <= 4);
  if (nameLine) suggestions.name = nameLine;

  const roleLine = head.find(
    (l) => l !== nameLine && !LOCATION_LINE.test(l) && l.length < 60 && !/[,@]/.test(l) && !/https?:|www\.|\d{4,}/.test(l)
  );
  if (roleLine) suggestions.role = roleLine;

  const locationLine = head.find((l) => LOCATION_LINE.test(l));
  if (locationLine) suggestions.location = locationLine;

  // A "Summary"/"Profile"/"About" heading, and everything up to the next
  // section heading or a blank-line-implied break.
  const headerIdx = lines.findIndex((l) => SECTION_HEADERS.test(l));
  if (headerIdx !== -1) {
    const body: string[] = [];
    for (let i = headerIdx + 1; i < lines.length && i < headerIdx + 8; i++) {
      if (NEXT_SECTION_HEADER.test(lines[i])) break;
      body.push(lines[i]);
    }
    const bio = body.join(" ").trim();
    if (bio.length > 20) suggestions.bio = bio.length > 500 ? `${bio.slice(0, 497)}…` : bio;
  }

  return suggestions;
}

/**
 * Technologies looked for, as [display name, pattern]. A fixed list on
 * purpose: free-form "skill extraction" from prose invents skills, and a
 * hiring team reading "found in the resume" should be reading words that are
 * actually in it.
 */
const SKILLS: Array<[string, RegExp]> = [
  ["Python", /\bpython\b/gi],
  ["JavaScript", /\bjavascript\b|\bES6\b/gi],
  ["TypeScript", /\btypescript\b/gi],
  ["Go", /\bgolang\b|\bGo\b(?=\s*[,/|()]|\s+(?:lang|services?|backend|microservices?))/g],
  ["Java", /\bjava\b(?!script)/gi],
  ["Kotlin", /\bkotlin\b/gi],
  ["Swift", /\bswift\b/gi],
  ["C++", /\bc\+\+/gi],
  ["C#", /\bc#/gi],
  ["Rust", /\brust\b/gi],
  ["Ruby", /\bruby\b/gi],
  ["PHP", /\bphp\b/gi],
  ["SQL", /\bsql\b/gi],
  ["React", /\breact(?:\.js|js)?\b/gi],
  ["Next.js", /\bnext\.?js\b/gi],
  ["Vue", /\bvue(?:\.js|js)?\b/gi],
  ["Angular", /\bangular\b/gi],
  ["Node.js", /\bnode\.?js\b/gi],
  ["Express", /\bexpress(?:\.js|js)?\b/gi],
  ["Django", /\bdjango\b/gi],
  ["Flask", /\bflask\b/gi],
  ["FastAPI", /\bfastapi\b/gi],
  ["Spring", /\bspring(?:\s+boot)?\b/gi],
  ["Rails", /\brails\b/gi],
  [".NET", /\.net\b/gi],
  ["PostgreSQL", /\bpostgres(?:ql)?\b/gi],
  ["MySQL", /\bmysql\b/gi],
  ["MongoDB", /\bmongo(?:db)?\b/gi],
  ["Redis", /\bredis\b/gi],
  ["Kafka", /\bkafka\b/gi],
  ["GraphQL", /\bgraphql\b/gi],
  ["Docker", /\bdocker\b/gi],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/gi],
  ["Terraform", /\bterraform\b/gi],
  ["AWS", /\baws\b|\bamazon web services\b/gi],
  ["GCP", /\bgcp\b|\bgoogle cloud\b/gi],
  ["Azure", /\bazure\b/gi],
  ["Linux", /\blinux\b/gi],
  ["Git", /\bgit\b(?!hub|lab)/gi],
  ["CI/CD", /\bci\/cd\b/gi],
  ["PyTorch", /\bpytorch\b/gi],
  ["TensorFlow", /\btensorflow\b/gi],
  ["Pandas", /\bpandas\b/gi],
  ["HTML", /\bhtml5?\b/gi],
  ["CSS", /\bcss3?\b/gi],
  ["Tailwind", /\btailwind(?:\s*css)?\b/gi],
];

const MAX_SKILLS = 24;

export function skillsFromText(text: string): string[] {
  const found: Array<{ name: string; count: number; first: number }> = [];
  for (const [name, pattern] of SKILLS) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) found.push({ name, count: matches.length, first: matches[0].index ?? 0 });
  }
  // Most-mentioned first; ties in the order the resume brings them up.
  found.sort((a, b) => b.count - a.count || a.first - b.first);
  return found.slice(0, MAX_SKILLS).map((f) => f.name);
}

function linksFromText(text: string): ResumeFields["links"] {
  const links: ResumeFields["links"] = {};
  const github = text.match(/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)(?![a-zA-Z0-9-])/i);
  if (github) links.github = github[1];
  const gitlab = text.match(/gitlab\.com\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,100})/i);
  if (gitlab) links.gitlab = gitlab[1].replace(/[.-]+$/, "");
  const linkedin = text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-_%]{3,100})/i);
  if (linkedin) links.linkedin = linkedin[1];
  return links;
}

function yearsFromText(text: string, thisYear: number): ResumeFields["years"] {
  const years = [...text.matchAll(/\b(19[7-9]\d|20\d{2})\b/g)].map((m) => Number(m[1])).filter((y) => y <= thisYear + 1);
  if (years.length < 2) return undefined;
  const from = Math.min(...years);
  const to = Math.min(Math.max(...years), thisYear);
  return from < to ? { from, to } : undefined;
}

/** Everything read out of a resume's text. `thisYear` is a parameter so the check doesn't depend on the clock. */
export function parseResumeText(textRaw: string, thisYear: number = new Date().getFullYear()): ResumeFields {
  const text = textRaw.slice(0, MAX_RESUME_TEXT);
  return {
    ...suggestFieldsFromText(text),
    skills: skillsFromText(text),
    links: linksFromText(text),
    years: yearsFromText(text, thisYear),
  };
}
