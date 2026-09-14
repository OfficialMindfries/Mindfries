/**
 * Sample data for the candidate dashboard.
 *
 * There is no backend yet (PRD §2.3), so every number and row below is
 * hand-written. It lives in its own module rather than inline in the JSX so
 * that wiring a real API later is a change to one file, and so nobody
 * mistakes a component for a data source.
 *
 * The shapes are the honest ones the product needs, not whatever made the
 * mockup look full: an assessment a candidate has been invited to, the state
 * it's in, and the evidence trail that comes out of it.
 */

export type AssessmentStatus = "invited" | "in-progress" | "submitted" | "closed";

export interface Assessment {
  id: string;
  role: string;
  company: string;
  location: string;
  /** Short descriptors shown as chips — format, length, working style. */
  tags: string[];
  status: AssessmentStatus;
  /** Human phrasing, since "due in 3 days" reads better than a date here. */
  due: string;
  /** 0–100. Only shown for invitations, where it's a reason to start. */
  match?: number;
}

export interface ActivityEntry {
  id: string;
  title: string;
  detail: string;
  when: string;
  kind: "session" | "report" | "invite" | "practice";
}

export interface SetupStep {
  label: string;
  done: boolean;
}

// role and location are kept discrete — not just parsed out of headline —
// because the profile page lays them out separately; headline is still the
// single combined string the nav and dashboard greeting use.
const ROLE = "Full-stack engineer";
const LOCATION = "Bengaluru, IN";

export const candidate = {
  name: "Rishi",
  initials: "R",
  role: ROLE,
  location: LOCATION,
  headline: `${ROLE} · ${LOCATION}`,
};

export interface Stat {
  kind: AssessmentStatus | "practice";
  label: string;
  value: number;
  hint: string;
}

/**
 * `kind` ties each counter to the same state an assessment can be in, so the
 * dashboard colours a counter and the assessments it counts the same way.
 */
export const stats: Stat[] = [
  { kind: "invited", label: "Open invitations", value: 1, hint: "1 closes in 3 days" },
  { kind: "in-progress", label: "In progress", value: 1, hint: "Can't be re-entered once started" },
  { kind: "submitted", label: "Submitted", value: 2, hint: "Both under review" },
  { kind: "practice", label: "Practice runs", value: 4, hint: "Unlimited, never scored" },
];

/**
 * The real counters, derived from the same list `AssessmentNotes` renders —
 * so the dashboard can never again show a real "no assessments" list next to
 * a hardcoded "1 open invitation" note above it (the contradiction
 * `CANDIDATE_BACKEND_PLAN.md` §3 flagged). `items` is only ever the real
 * backend list here, never the sample one — see StatNotes for the branch.
 *
 * "Practice runs" has no real analog yet — nothing in this product tracks a
 * practice session anywhere — so it reports 0 and says so, rather than
 * carrying over the sample's invented "4."
 */
export function deriveStats(items: Assessment[]): Stat[] {
  const count = (status: AssessmentStatus) => items.filter((a) => a.status === status).length;
  const invited = count("invited");
  const inProgress = count("in-progress");
  const submitted = count("submitted");

  return [
    {
      kind: "invited",
      label: "Open invitations",
      value: invited,
      hint: invited === 0 ? "Nothing open right now" : `${invited} open right now`,
    },
    {
      kind: "in-progress",
      label: "In progress",
      value: inProgress,
      hint: inProgress === 0 ? "Nothing in progress" : "Can't be re-entered once started",
    },
    {
      kind: "submitted",
      label: "Submitted",
      value: submitted,
      hint: submitted === 0 ? "Nothing submitted yet" : submitted === 1 ? "Under review" : "All under review",
    },
    { kind: "practice", label: "Practice runs", value: 0, hint: "Not tracked yet" },
  ];
}

/**
 * Mercor's three-step header, adapted. The steps are the things that must be
 * true before a real session can start, so the bar doubles as a checklist
 * rather than decoration.
 */
export const setupSteps: SetupStep[] = [
  { label: "Profile", done: true },
  { label: "Environment check", done: false },
  { label: "Practice run", done: false },
];

export const assessments: Assessment[] = [
  {
    id: "a1",
    role: "Senior Engineer, Agentic AI",
    company: "Northwind Labs",
    location: "Bengaluru, KA, IN",
    tags: ["Take-home", "90 min", "Remote"],
    status: "invited",
    due: "Closes in 3 days",
    match: 92,
  },
  {
    id: "a2",
    role: "Full-stack Engineer",
    company: "Kestrel",
    location: "Remote, IN",
    tags: ["Live session", "2 hours", "Proctored"],
    status: "in-progress",
    due: "Started 2 days ago",
  },
  {
    id: "a3",
    role: "Platform Engineer",
    company: "Halden & Co.",
    location: "Pune, MH, IN",
    tags: ["Take-home", "75 min", "Remote"],
    status: "submitted",
    due: "Submitted 04 Sep",
  },
  {
    id: "a4",
    role: "Backend Engineer, Payments",
    company: "Trellis",
    location: "Hyderabad, TG, IN",
    tags: ["Live session", "90 min", "Proctored"],
    status: "submitted",
    due: "Submitted 28 Aug",
  },
  {
    id: "a5",
    role: "Machine Learning Engineer",
    company: "Sundial",
    location: "Bengaluru, KA, IN",
    tags: ["Take-home", "2 hours", "Remote"],
    status: "closed",
    due: "Closed 21 Aug",
  },
];

export const activity: ActivityEntry[] = [
  {
    id: "e1",
    kind: "report",
    title: "Evidence report shared with Halden & Co.",
    detail: "Navigation, commits, tests and reasoning from your session",
    when: "Today, 09:14",
  },
  {
    id: "e2",
    kind: "session",
    title: "Submitted Platform Engineer assessment",
    detail: "1 h 12 m · 34 commits · 18 tests run",
    when: "Yesterday, 18:40",
  },
  {
    id: "e3",
    kind: "session",
    title: "Paused Full-stack Engineer session",
    detail: "48 m in · your workspace is exactly where you left it",
    when: "2 Sep, 20:05",
  },
  {
    id: "e4",
    kind: "invite",
    title: "Invited to Senior Engineer, Agentic AI",
    detail: "Northwind Labs · take-home, 90 minutes",
    when: "1 Sep, 11:22",
  },
  {
    id: "e5",
    kind: "practice",
    title: "Completed a practice run",
    detail: "Nothing from a practice run is ever shared",
    when: "30 Aug, 16:03",
  },
];

export const resources = [
  {
    title: "What the workspace records",
    body: "Every signal captured during a session, and what a hiring team sees.",
  },
  {
    title: "Explaining your decisions",
    body: "The reasoning prompts matter as much as the code. How to answer them well.",
  },
  {
    title: "Before your first session",
    body: "Camera, microphone and a five-minute practice run.",
  },
];

export const statusLabels: Record<AssessmentStatus, string> = {
  invited: "Invited",
  "in-progress": "In progress",
  submitted: "Submitted",
  closed: "Closed",
};

/** All four statuses, in the order they're worth your attention. */
export const ASSESSMENT_STATUSES: AssessmentStatus[] = ["invited", "in-progress", "submitted", "closed"];

const ATTENTION_ORDER: Record<AssessmentStatus, number> = { invited: 0, "in-progress": 1, submitted: 2, closed: 3 };

/**
 * Needs-your-action first: an open invitation before a session you've
 * already submitted. Used wherever a list of assessments is shown without an
 * explicit sort of its own — the dashboard's preview and the full
 * Assessments page's "All" view both read this way.
 */
export function sortByAttention(items: Assessment[]): Assessment[] {
  return [...items].sort((a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status]);
}
