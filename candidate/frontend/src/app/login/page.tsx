import type { Metadata } from "next";
import { LoginBlobs } from "@/components/login/LoginBlobs";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Mindfries",
  description: "Sign in to your Mindfries candidate workspace.",
};

/**
 * The candidate portal's entry point, shaped after the supplied reference —
 * centred form, no card border, scattered decorative shapes — redrawn in
 * this app's own palette. See LoginForm's own doc comment for what "Login"
 * and the four social buttons honestly do: there's no candidate account
 * system yet, so neither pretends to check a credential against one.
 */
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <span className="text-[22px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
