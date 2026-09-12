import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { AssessmentWall } from "@/components/assessments/AssessmentWall";
import { StatusTabs } from "@/components/assessments/StatusTabs";
import {
  ASSESSMENT_STATUSES,
  assessments as sample,
  sortByAttention,
  statusLabels,
  type AssessmentStatus,
} from "@/lib/dashboard/data";
import { listAssessmentsOrUndefined } from "@/lib/backend/client";

export const metadata: Metadata = {
  title: "Assessments · Mindfries",
  description: "Every invitation, session and result, in one place.",
};

// Same reasoning as the dashboard: assessments come from the real backend
// per request, so this can't be prerendered once at build time.
export const dynamic = "force-dynamic";

/**
 * The full wall the dashboard's "Your assessments" only previews three of.
 * Filtering by status is a real query string (?status=submitted), not client
 * state, so a filtered view is something you can bookmark or hand to
 * someone — filtered server-side, the same as the admin's Targets page.
 */
export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const items = await listAssessmentsOrUndefined();
  const all = sortByAttention(items ?? sample);

  const counts = Object.fromEntries(
    ASSESSMENT_STATUSES.map((s) => [s, all.filter((a) => a.status === s).length])
  ) as Record<AssessmentStatus, number>;

  const active = status && ASSESSMENT_STATUSES.includes(status as AssessmentStatus) ? (status as AssessmentStatus) : undefined;
  const filtered = active ? all.filter((a) => a.status === active) : all;

  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-[#0A1931]">
              Assessments
            </h1>
            <p className="mt-1.5 text-sm text-[#4A7FA7]">
              Every invitation, session and result, in one place.
            </p>
          </div>
        </div>

        <StatusTabs active={active} counts={counts} total={all.length} />

        <div className="mt-8">
          <AssessmentWall
            items={filtered}
            emptyTitle={active ? `No ${statusLabels[active].toLowerCase()} assessments` : undefined}
            emptyBody={active ? "Nothing here right now — check back later." : undefined}
          />
        </div>
      </main>
    </div>
  );
}
