/**
 * Shapes and derivations for the candidate dashboard.
 *
 * No assessment, counter or activity row is written here any more — those
 * come from the candidate's real records (lib/backend/client.ts's
 * listAssessmentsOrUndefined). What's left is the types, the labels, and the
 * pure functions that turn a real list into what the dashboard shows.
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

export interface Stat {
  kind: AssessmentStatus | "practice";
  label: string;
  value: number;
  hint: string;
}

/**
 * The counters, derived from the same list `AssessmentNotes` renders, so the
 * two can never disagree. `kind` ties each counter to the same state an
 * assessment can be in, so a counter and the assessments it counts share a
 * colour.
 *
 * "Practice runs" has no real source yet — nothing in this product tracks a
 * practice session anywhere — so it reports 0 and says so.
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
