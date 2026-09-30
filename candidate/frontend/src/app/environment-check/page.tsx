import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { currentCandidate } from "@/lib/auth/users";
import { Camera, Mic, Monitor, CheckCircle2, XCircle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Environment Check · Mindfries",
  description: "Make sure your browser, camera, and microphone are ready for a live session.",
};

export default async function EnvironmentCheckPage() {
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
          Environment check
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-[#4A7FA7]">
          Two minutes: camera, microphone, and whether your browser can run the workspace.
          Do it once before your first real session.
        </p>

        <div className="mt-8 space-y-4">
          <CheckItem
            icon={<Camera size={20} />}
            title="Camera access"
            description="We need camera permission to verify your identity during live sessions."
          />
          <CheckItem
            icon={<Mic size={20} />}
            title="Microphone access"
            description="Required for AI interview sessions."
          />
          <CheckItem
            icon={<Monitor size={20} />}
            title="Browser compatibility"
            description="Checks that your browser supports the workspace features."
          />
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-[#4A7FA7]/40 bg-[#B3CFE5]/10 p-6 text-center">
          <p className="text-[14px] font-medium text-[#1A3D63]">
            🚧 Environment check will be available once assessment sessions are live.
          </p>
          <p className="mt-2 text-[12.5px] text-[#4A7FA7]">
            For now, make sure you're using a modern browser (Chrome, Edge, or Firefox)
            with camera and mic permissions enabled.
          </p>
        </div>
      </main>
    </div>
  );
}

function CheckItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-[#B3CFE5] bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B3CFE5]/30 text-[#1A3D63]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[#0A1931]">{title}</p>
        <p className="mt-0.5 text-[12.5px] text-[#4A7FA7]">{description}</p>
      </div>
    </div>
  );
}
