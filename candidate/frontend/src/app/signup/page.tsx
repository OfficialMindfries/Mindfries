import type { Metadata } from "next";
import { LoginBlobs } from "@/components/login/LoginBlobs";
import { SignupForm } from "@/components/login/SignupForm";

export const metadata: Metadata = {
  title: "Create account · Mindfries",
  description: "Create your Mindfries candidate account.",
};

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <span className="text-[22px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </div>

        <SignupForm />
      </div>
    </div>
  );
}
