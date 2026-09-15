import { LoginBlobs } from "@/components/login/LoginBlobs";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * No /signup route exists in this app (IMPLEMENTATION.md §3.6, §6) — a
 * company's first account is created by Mindfries ops from internal-admin's
 * onboarding flow, which emails a one-time link to /set-password. This page
 * only ever signs an existing account in.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only a path on this site survives; anything else falls back to
  // /dashboard, so a crafted ?next= can't bounce someone off to another
  // origin after login.
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "";

  return (
    <div className="ambient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <div>
            <div className="text-[19px] font-extrabold tracking-tight">Mindfries</div>
            <div className="eyebrow -mt-0.5">Company Portal</div>
          </div>
        </div>

        <LoginForm next={safeNext} />

        <p className="mt-6 max-w-xs text-center text-xs text-faint">
          Accounts are added by your company&apos;s admin, or by Mindfries when
          your workspace is set up. Locked out? Ask someone with access to
          invite you.
        </p>
      </div>
    </div>
  );
}
