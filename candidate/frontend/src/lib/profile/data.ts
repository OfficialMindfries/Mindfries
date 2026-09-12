/**
 * Sample data for the candidate's profile page.
 *
 * Same situation as lib/dashboard/data.ts: there's no candidate-profile table
 * yet (PRD §2.3), so this is hand-written rather than shaped to look like a
 * real API response. `candidate`'s name, role and location already live in
 * lib/dashboard/data.ts — this file only adds what the profile page needs on
 * top of that.
 *
 * The resume and linked-account data are NOT here — those are genuinely
 * dynamic (a real file picker, a real GitHub/GitLab lookup) and live in
 * lib/profile/storage.ts instead, kept in the browser rather than sample
 * data baked into the build. `resolveIdentity` below is the seam between the
 * two: sample until the "Edit profile" form saves something real.
 */

import { candidate } from "@/lib/dashboard/data";
import type { StoredIdentity } from "./storage";

export const bio =
  "Building backend services and the occasional bit of infra for six years, most recently on payments and workflow automation. Prefers a small, well-tested change over a rewrite, and reads a codebase's tests before its README.";

export const availability = {
  openTo: ["Remote", "Hybrid"],
  noticePeriod: "30 days",
};

/** Notice periods the edit form offers — the small set a real ATS field would use, not free text. */
export const NOTICE_PERIODS = ["Immediately", "2 weeks", "30 days", "60 days", "90 days"];

/** How a candidate can be reached about work — the edit form's multi-select. */
export const OPEN_TO_OPTIONS = ["Remote", "Hybrid", "Onsite"];

export interface DisplayIdentity {
  name: string;
  role: string;
  location: string;
  openTo: string[];
  noticePeriod: string;
  bio: string;
  /** null means this is still the sample identity — nothing has been saved yet. */
  updatedAt: string | null;
}

/**
 * The saved edit if there is one; otherwise the signed-in session's real
 * name over the sample one; otherwise the sample identity outright (signed
 * out, or the rare page that doesn't have a session to pass in).
 *
 * Only `name` has a real, signed-in-session source today — role, location,
 * bio and availability are candidate-editable fields that only exist once
 * "Edit profile" saves them (see CANDIDATE_BACKEND_PLAN.md §6.3); until
 * then those stay the sample's, same as before. This is what keeps the
 * dashboard greeting, the nav avatar, and the account menu from reading
 * three different names for the same signed-in candidate.
 */
export function resolveIdentity(saved: StoredIdentity | null, sessionName?: string): DisplayIdentity {
  if (saved) return saved;
  return {
    name: sessionName?.trim() || candidate.name,
    role: candidate.role,
    location: candidate.location,
    openTo: availability.openTo,
    noticePeriod: availability.noticePeriod,
    bio,
    updatedAt: null,
  };
}
