import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { StatTiles } from "@/components/dashboard/StatTiles";
import { SetupCard } from "@/components/dashboard/SetupCard";
import { AssessmentRail } from "@/components/dashboard/AssessmentRail";
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
 * Shaped after Eightfold — top bar, a warm greeting, a row of counters, then
 * sections of cards — because that layout puts the state of things in the
 * first screenful without a wall of tabs. What's borrowed from the other two
 * references is noted in the component that borrows it.
 *
 * Everything is static sample data (see lib/dashboard/data.ts). There's no
 * backend to ask, and inventing a loading state for a fetch that doesn't
 * exist would be a lie in the shape of a feature.
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

        <div className="mt-6">
          <StatTiles />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* `min-w-0` is load-bearing: a grid item defaults to `min-width:
              auto`, so the assessment rail's row of fixed-width cards would
              stretch this column past the viewport and give the whole page a
              horizontal scrollbar — the rail is meant to be the only thing
              that scrolls sideways. */}
          <div className="min-w-0 space-y-8">
            <SetupCard />
            <AssessmentRail />
            <ActivityFeed />
          </div>
          <SideRail />
        </div>
      </main>
    </div>
  );
}
