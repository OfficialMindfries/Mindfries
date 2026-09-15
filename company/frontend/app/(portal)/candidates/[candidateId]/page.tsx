import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * IMPLEMENTATION.md Phase 3: score breakdown by section, time taken, stage-
 * change actions, side-by-side comparison. Not built yet.
 */
export default async function CandidateDetailPage({ params }: { params: Promise<{ candidateId: string }> }) {
  await params;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Candidates" title="Candidate profile" />
      <EmptyState title="Coming in Phase 3" hint="Score breakdown, time taken, and stage-change actions — see IMPLEMENTATION.md §11." />
    </div>
  );
}
