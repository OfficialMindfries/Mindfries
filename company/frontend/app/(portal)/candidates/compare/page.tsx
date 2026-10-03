import { notFound } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { getApplicationForCompany, type CandidateApplicationWithRole } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CompareTable } from "./CompareTable";

export const dynamic = "force-dynamic";

const MIN_COMPARE = 2;
const MAX_COMPARE = 4;

/**
 * Reached only via CandidatesBoard's Compare button, never linked
 * directly — no sidebar entry. 2-4 ids, deduped and capped, each resolved
 * through the same company-scoped getApplicationForCompany every other
 * candidate read already uses; any id that doesn't resolve for this
 * company (wrong company, typo, deleted) 404s the whole page rather than
 * silently dropping it.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: idsParam } = await searchParams;
  const ids = Array.from(new Set((idsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean))).slice(0, MAX_COMPARE);
  if (ids.length < MIN_COMPARE) notFound();

  const user = await currentCompanyUser();
  if (!user) notFound();

  const results = await Promise.all(ids.map((id) => getApplicationForCompany(user.companyId, id)));
  const candidates = results.filter((c): c is CandidateApplicationWithRole => !!c);
  if (candidates.length !== ids.length) notFound();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Candidates" title="Compare candidates">
        Click a row to sort all {candidates.length} by it.
      </PageHeader>
      <CompareTable candidates={candidates} />
    </div>
  );
}
