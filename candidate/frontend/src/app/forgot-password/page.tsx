import type { Metadata } from "next";
import { LoginBlobs } from "@/components/login/LoginBlobs";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = {
  title: "Forgot password · Mindfries",
  description: "Get a link to choose a new password.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <span className="text-[22px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </div>

        <ForgotForm />
      </div>
    </div>
  );
}
