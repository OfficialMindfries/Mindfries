import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { currentCandidate } from "@/lib/auth/users";
import { ArrowLeft, Play, Terminal } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Practice Run · Mindfries",
  description: "Try the workspace with a throwaway task. Nothing is recorded or scored.",
};

export default async function PracticeRunPage() {
  const session = await currentCandidate();

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
          A real workspace with a throwaway task. Nothing from it is recorded, scored, or shared.
          Get comfortable before the real thing.
        </p>

        <div className="mt-8 rounded-2xl border border-[#B3CFE5] bg-white p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1A3D63] text-white">
              <Terminal size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-semibold text-[#0A1931]">Sample task</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#4A7FA7]">
                Build a simple REST endpoint — the same kind of task you'd see in a real session,
                but nothing here counts.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-[#4A7FA7]/40 bg-[#B3CFE5]/10 p-6 text-center">
          <p className="text-[14px] font-medium text-[#1A3D63]">
            🚧 Practice sessions will be available once the sandbox environment is configured.
          </p>
          <p className="mt-2 text-[12.5px] text-[#4A7FA7]">
            This needs the Daytona sandbox backend. Your teammate can set that up on the company side.
          </p>
        </div>
      </main>
    </div>
  );
}
