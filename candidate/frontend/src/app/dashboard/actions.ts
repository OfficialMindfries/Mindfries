"use server";

import { redirect } from "next/navigation";

// Candidate clicks "Start assessment" on the dashboard → take them into the
// onboarding wizard (consent → device check → instructions lobby), carrying
// which assessment they picked the whole way through as a real query param
// — nothing further down this flow invents or hardcodes a template id.
//
// The live session is created — and the timer starts — only at the final step
// of the wizard, when the candidate clicks "Enter Workspace" and is satisfied
// they're ready. See src/app/onboarding/actions.ts for that server action.
export async function startAssessment(templateId: string) {
  redirect(`/onboarding?template=${encodeURIComponent(templateId)}`);
}
