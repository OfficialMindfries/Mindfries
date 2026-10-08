import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { currentCandidate } from "@/lib/auth/users";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getSetupState } from "@/lib/setup-state";
import { EnvironmentCheck } from "@/components/environment/EnvironmentCheck";

export const metadata: Metadata = {
  title: "Environment Check · Mindfries",
  description: "Make sure your browser, camera, and microphone are ready for a live session.",
};

export default async function EnvironmentCheckPage() {
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
          Environment check
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-[#4A7FA7]">
          Two minutes: camera, microphone, and whether your browser can run the workspace.
          Do it once before your first real session.
        </p>

        <EnvironmentCheck lastPassedAt={setup.environmentCheckedAt} />
      </main>
    </div>
  );
}
