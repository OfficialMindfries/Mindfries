import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { IdentityCard } from "@/components/profile/IdentityCard";
import { SkillsCard } from "@/components/profile/SkillsCard";
import { EvidenceSummary } from "@/components/profile/EvidenceSummary";
import { ResumeCard } from "@/components/profile/ResumeCard";

export const metadata: Metadata = {
  title: "Profile · Mindfries",
  description: "What hiring teams see alongside the evidence from your sessions.",
};

/**
 * The candidate's profile: who they are, what they bring, and what their
 * sessions have produced so far. Deliberately not an account-settings page —
 * there's no auth or profile-write path yet, so nothing here pretends to be
 * editable. See IdentityCard and ResumeCard for where that shows up.
 *
 * Cards, not sticky notes: StickyNote's wall is for things that happen to
 * you (an invitation, a deadline), and a profile is closer to a résumé than
 * an event feed — see StickyNote's own doc comment on why colour there is
 * reserved for state.
 */
export default function ProfilePage() {
  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-[#0A1931]">Profile</h1>
          <p className="mt-1.5 text-sm text-[#4A7FA7]">
            What hiring teams see alongside the evidence from your sessions.
          </p>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <IdentityCard />
            <SkillsCard />
          </div>

          <aside className="space-y-4">
            <EvidenceSummary />
            <ResumeCard />
          </aside>
        </div>
      </main>
    </div>
  );
}
