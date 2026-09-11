import type { AssessmentStatus } from "@/lib/dashboard/data";
import type { NoteTone } from "./StickyNote";

/**
 * The one mapping from state to paper colour, shared by the counters and the
 * assessment notes — so "yellow" means the same thing in both places, and a
 * candidate can tell at a glance which assessments the "Open invitations"
 * count is counting.
 */
export const TONE: Record<AssessmentStatus | "practice", NoteTone> = {
  invited: "yellow",
  "in-progress": "pink",
  submitted: "green",
  closed: "lavender",
  practice: "blue",
};
