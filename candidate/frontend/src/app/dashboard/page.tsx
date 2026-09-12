import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { StatNotes } from "@/components/dashboard/StatNotes";
import { SetupCard } from "@/components/dashboard/SetupCard";
import { AssessmentNotes } from "@/components/dashboard/AssessmentNotes";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SideRail } from "@/components/dashboard/SideRail";
import { candidate } from "@/lib/dashboard/data";
import { listAssessmentsOrUndefined } from "@/lib/backend/client";

export const metadata: Metadata = {
  title: "Dashboard · Mindfries",
  description: "Your assessments, sessions and evidence reports.",
};

// Assessments are read per request from the shared Supabase, so this page
// can't be prerendered once at build time.
export const dynamic = "force-dynamic";

/**
 * The candidate's home, outside the workspace.
 *
 * The counters and the assessments are sticky notes, after brainwhite; see
 * `StickyNote` for why colour carries meaning and the notes never overlap.
 * Assessments come from the real candidate/backend (Go — PRD §2.3) when it's
 * configured and reachable, and fall back to the sample data in
 * `lib/dashboard/data.ts` otherwise — everything else on the page is still
 * sample data.
 */
export default async function DashboardPage() {
  const items = await listAssessmentsOrUndefined();

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
            className="btn-wipe inline-flex items-center justify-center gap-2 px-5 py-2.5 text-[13px] font-semibold"
            style={{ "--btn-bg": "#4A7FA7", "--btn-fg": "#F6FAFD", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
          >
            Open the workspace
          </a>
        </div>

        <div className="mt-8">
          <StatNotes />
        </div>

        <div className="mt-12 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* `min-w-0` stops a grid item's default `min-width: auto` from
              letting wide content stretch this column past the viewport. */}
          <div className="min-w-0 space-y-10">
            <SetupCard />
            <AssessmentNotes items={items} />
            <ActivityFeed />
          </div>
          <SideRail />
        </div>
      </main>
    </div>
  );
}
