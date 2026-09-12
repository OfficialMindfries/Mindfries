/**
 * Sample data for the candidate's profile page.
 *
 * Same situation as lib/dashboard/data.ts: there's no candidate-profile table
 * yet (PRD §2.3), so this is hand-written rather than shaped to look like a
 * real API response. `candidate`'s name, role and location already live in
 * lib/dashboard/data.ts — this file only adds what the profile page needs on
 * top of that, and nothing here is fabricated to stand in for something the
 * page can't actually do yet (see `resume` below).
 */

export interface SkillGroup {
  label: string;
  items: string[];
}

export const bio =
  "Building backend services and the occasional bit of infra for six years, most recently on payments and workflow automation. Prefers a small, well-tested change over a rewrite, and reads a codebase's tests before its README.";

export const skills: SkillGroup[] = [
  { label: "Languages", items: ["TypeScript", "Python", "Go"] },
  { label: "Frameworks", items: ["Next.js", "FastAPI", "PostgreSQL"] },
  { label: "Tools", items: ["Docker", "Terraform", "GitHub Actions"] },
];

export const availability = {
  openTo: ["Remote", "Hybrid"],
  noticePeriod: "30 days",
};

/**
 * No storage is wired up for this yet, so the page says exactly that instead
 * of drawing an upload control that would silently do nothing if pressed.
 */
export const resume = {
  uploaded: false,
};
