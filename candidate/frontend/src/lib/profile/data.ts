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
 * data baked into the build.
 */

export const bio =
  "Building backend services and the occasional bit of infra for six years, most recently on payments and workflow automation. Prefers a small, well-tested change over a rewrite, and reads a codebase's tests before its README.";

export const availability = {
  openTo: ["Remote", "Hybrid"],
  noticePeriod: "30 days",
};
