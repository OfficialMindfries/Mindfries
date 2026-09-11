import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { SetupCard } from "@/components/dashboard/SetupCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SideRail } from "@/components/dashboard/SideRail";
import { candidate } from "@/lib/dashboard/data";

export const metadata: Metadata = {
  title: "Dashboard · Mindfries",
  description: "Your assessments, sessions and evidence reports.",
};

/**
 * The candidate's home, outside the workspace.
 *
 * The stat tiles and the assessment carousel have been taken out, to be
 * redesigned as sticky notes. What they drew on is still in place for that:
 *
 * - `listAvailableAssessments()` in `lib/db.ts` — the candidate's real
 *   assessments from the shared Supabase, when it's configured. The page no
 *   longer calls it, so it's static again; re-adding the call means re-adding
 *   `export const dynamic = "force-dynamic"` with it.
 * - `startAssessment` in `app/dashboard/actions.ts` — the only way from here
 *   into `/onboarding`. Until the notes land, nothing on this page reaches it.
 * - `stats` and `assessments` in `lib/dashboard/data.ts` — the sample data
 *   both sections fell back to.
 */
export default function DashboardPage() {
  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-[#0A1931]">
              Welcome back, {candidate.name}
            </h1>
            <p className="mt-1.5 text-sm text-[#4A7FA7]">{candidate.headline}</p>
          </div>
          <a
            href="/ide"
            className="inline-flex items-center gap-2 rounded-lg bg-[#4A7FA7] px-4 py-2.5 text-[13px] font-medium text-[#F6FAFD] transition-opacity hover:opacity-90"
          >
            Open the workspace
          </a>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* `min-w-0` stops a grid item's default `min-width: auto` from
              letting wide content stretch this column past the viewport. */}
          <div className="min-w-0 space-y-8">
            <SetupCard />
            <ActivityFeed />
          </div>
          <SideRail />
        </div>
      </main>
    </div>
  );
}
