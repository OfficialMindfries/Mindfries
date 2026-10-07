import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { currentCandidate } from "@/lib/auth/users";
import { ArrowLeft, ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getSetupState } from "@/lib/setup-state";
import { startPracticeRun } from "@/lib/setup-actions";

export const metadata: Metadata = {
  title: "Practice Run · Mindfries",
  description: "Try the workspace with a throwaway task. Nothing is recorded or scored.",
};

export default async function PracticeRunPage() {
  const session = await currentCandidate();
  const setup = await getSetupState(session?.id);

  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav sessionName={session?.name} />

      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4A7FA7] transition-colors hover:text-[#1A3D63]"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <h1 className="mt-6 text-[24px] font-semibold tracking-tight text-[#0A1931]">
          Practice run
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-[#4A7FA7]">
          The real workspace with a throwaway task. Nothing you do in it is recorded, scored or shared — there is no
          session behind it. The one thing we keep is that you opened one, so your dashboard can tick this step off.
        </p>

        <div className="mt-8 rounded-2xl border border-[#B3CFE5] bg-white p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1A3D63] text-white">
              <Terminal size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-semibold text-[#0A1931]">Sample task</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#4A7FA7]">
                A small Python project with one bug and a test that catches it — the same shape as a real
                assessment. Read the brief, run the tests, fix it, watch them pass. Try git, the terminal and the
                Tests panel while you&apos;re there.
              </p>
            </div>
          </div>
        </div>

        <form action={startPracticeRun} className="mt-6 flex flex-wrap items-center gap-4">
          <Button type="submit">
            {setup.practiceRuns > 0 ? "Open another practice run" : "Open a practice run"}
            <ArrowRight size={14} />
          </Button>
          <span className="text-[12.5px] text-[#4A7FA7]">
            {setup.practiceRuns === 0
              ? "No time limit. Leave whenever you like."
              : `You've opened ${setup.practiceRuns} so far. Your earlier work in it is still there.`}
          </span>
        </form>

        <p className="mt-6 max-w-lg text-[12px] leading-relaxed text-[#4A7FA7]">
          It will ask for your camera and go fullscreen, exactly as a real session does, so you can see what that is
          like. In a practice run the camera picture stays in your browser and no stills are taken.
        </p>
      </main>
    </div>
  );
}
