import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { PreviewModeProvider } from "@/components/profile/PreviewMode";
import { IdentityCard } from "@/components/profile/IdentityCard";
import { ProfileStrength } from "@/components/profile/ProfileStrength";
import { LinkedAccounts } from "@/components/profile/LinkedAccounts";
import { EvidenceSummary } from "@/components/profile/EvidenceSummary";
import { ResumeUpload } from "@/components/profile/ResumeUpload";
import { NextSteps } from "@/components/profile/NextSteps";

export const metadata: Metadata = {
  title: "Profile · Mindfries",
  description: "What hiring teams see alongside the evidence from your sessions.",
};

/**
 * The candidate's profile: who they are, what they bring, and what their
 * sessions have produced so far.
 *
 * One edit surface, not several: name, role, location, availability and bio
 * all live in IdentityCard and are all changed through the same "Edit
 * profile" button (EditProfileModal) — there used to be a separate "About
 * you" card with its own edit affordance; folding it in here left one thing
 * to open instead of two. The resume and linked accounts manage themselves
 * inline, genuinely interactive, kept in this browser rather than on a
 * server that doesn't exist yet — see ResumeUpload and LinkedAccounts for
 * exactly what "saved" means there.
 *
 * "View as others see" (PreviewModeProvider) is a real toggle, not a label:
 * it hides every edit affordance and every not-yet-connected platform, so
 * what's left is what a hiring team's own view would actually render.
 *
 * The sidebar borrows StickyNote's three colours but not its tilt — that
 * motif is for the dashboard's wall of things happening to you; a profile
 * reads as reference material, so these sit flat.
 */
export default function ProfilePage() {
  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <PreviewModeProvider>
          <div className="mt-6">
            <ProfileStrength />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              <IdentityCard />
              <LinkedAccounts />
            </div>

            <aside className="space-y-4">
              <ResumeUpload />
              <EvidenceSummary />
              <NextSteps />
            </aside>
          </div>
        </PreviewModeProvider>
      </main>
    </div>
  );
}
