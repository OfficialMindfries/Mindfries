import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { StatTiles } from "@/components/dashboard/StatTiles";
import { SetupCard } from "@/components/dashboard/SetupCard";
import { AssessmentRail } from "@/components/dashboard/AssessmentRail";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SideRail } from "@/components/dashboard/SideRail";
import { candidate } from "@/lib/dashboard/data";
import { listAvailableAssessments } from "@/lib/db";
import { supabaseReady } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Dashboard · Mindfries",
  description: "Your assessments, sessions and evidence reports.",
};

export const dynamic = "force-dynamic";

/**
 * The candidate's home, outside the workspace.
 *
 * Assessments come from the shared Supabase (published games authored in the
 * internal-admin) once the backend is connected; otherwise the rail falls back
 * to sample data. Everything else is still sample data (lib/dashboard/data.ts).
 */
export default async function DashboardPage() {
  // undefined → AssessmentRail uses its mock fallback (pre-backend).
  const items = supabaseReady() ? await listAvailableAssessments() : undefined;

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
          <div className="min-w-0 space-y-8">
            <SetupCard />
            <AssessmentRail items={items} />
            <ActivityFeed />
          </div>
          <SideRail />
        </div>
      </main>
    </div>
  );
}
