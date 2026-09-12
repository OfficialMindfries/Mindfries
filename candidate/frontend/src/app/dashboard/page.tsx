import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { StatNotes } from "@/components/dashboard/StatNotes";
import { SetupCard } from "@/components/dashboard/SetupCard";
import { AssessmentNotes } from "@/components/dashboard/AssessmentNotes";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SideRail } from "@/components/dashboard/SideRail";
import { resolveIdentity } from "@/lib/profile/data";
import { listAssessmentsOrUndefined } from "@/lib/backend/client";
import { currentCandidate } from "@/lib/auth/users";

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
 * Assessments (and the counters derived from them) come from the real
 * candidate/backend (Go — PRD §2.3) when it's configured and reachable, and
 * fall back to the sample data in `lib/dashboard/data.ts` otherwise — the
 * two are never allowed to disagree about which mode they're in, since both
 * branch on the exact same `items` value. The greeting uses the real
 * signed-in candidate's name over the sample one; role/location stay
 * sample until a real profile-fields table exists (see
 * CANDIDATE_BACKEND_PLAN.md §6.3). The activity feed and setup checklist
 * are still sample data.
 */
export default async function DashboardPage() {
  const [items, session] = await Promise.all([listAssessmentsOrUndefined(), currentCandidate()]);
  // Server-rendered, so this never sees a locally-saved profile edit
  // (localStorage) — same limitation the old hardcoded name had. What it
  // fixes is showing the *real signed-in candidate's* name instead of the
  // sample "Rishi" for every session, verified live against a real account.
  const identity = resolveIdentity(null, session?.name);

  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav sessionName={session?.name} />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-[#0A1931]">
              Welcome back, {identity.name}
            </h1>
            <p className="mt-1.5 text-sm text-[#4A7FA7]">
              {identity.role}
              {identity.location && ` · ${identity.location}`}
            </p>
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
          <StatNotes items={items} />
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
