import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { listAssessmentsOrUndefined } from "@/lib/backend/client";
import type { LobbyAssessment } from "@/components/onboarding/LobbyStep";

/**
 * Assessments are looked up per request from the candidate's real records,
 * so this can't be prerendered once at build time.
 */
export const dynamic = "force-dynamic";

/**
 * Server entry point for the onboarding wizard. Its one job: resolve
 * `?template=<id>` — set by src/app/dashboard/actions.ts's startAssessment
 * when the candidate picked a real assessment — into that assessment's real
 * display details, then hand both down to the client-side step wizard.
 *
 * No assessment is invented here: a missing or unknown id renders
 * OnboardingWizard's own "no assessment selected" state rather than a
 * placeholder task.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template } = await searchParams;
  const templateId = template?.trim() || null;

  let assessment: LobbyAssessment | null = null;
  if (templateId) {
    const items = (await listAssessmentsOrUndefined()) ?? [];
    const match = items.find((a) => a.id === templateId);
    if (match) assessment = { role: match.role, company: match.company, tags: match.tags };
  }

  return <OnboardingWizard templateId={assessment ? templateId : null} assessment={assessment} />;
}
