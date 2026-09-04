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

export const candidate = {
  name: "Rishi",
  initials: "R",
  headline: "Full-stack engineer · Bengaluru, IN",
};

export const stats = [
  { label: "Open invitations", value: 1, hint: "1 closes in 3 days" },
  { label: "In progress", value: 1, hint: "Resume where you left off" },
  { label: "Submitted", value: 2, hint: "Both under review" },
  { label: "Practice runs", value: 4, hint: "Unlimited, never scored" },
] as const;

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
