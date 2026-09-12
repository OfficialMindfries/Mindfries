import type { Metadata } from "next";
import { LoginBlobs } from "@/components/login/LoginBlobs";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Mindfries",
  description: "Sign in to your Mindfries candidate workspace.",
};

export const dynamic = "force-dynamic";

/**
 * The candidate portal's entry point, shaped after the supplied reference —
 * centred form, no card border, scattered decorative shapes — redrawn in
 * this app's own palette. Real now: LoginForm submits to lib/auth/users.ts's
 * checkCredentials against candidate_users. See LoginForm's own doc comment
 * for what the four social buttons still honestly don't do.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only a path on this site survives; anything else falls back to /dashboard,
  // so a crafted ?next= can't bounce someone off to another origin after login.
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <span className="text-[22px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </div>

        <LoginForm next={safeNext} />
      </div>
    </div>
  );
}
