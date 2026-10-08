import type { Metadata } from "next";
import Link from "next/link";
import { LoginBlobs } from "@/components/login/LoginBlobs";
import { MIN_PASSWORD_LENGTH, resetLinkIsLive } from "@/lib/auth/email-links";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = {
  title: "Choose a new password · Mindfries",
  // The address carries a working token; it shouldn't travel in a Referer.
  referrer: "no-referrer",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Where a reset link lands. Opening it only looks the token up — it is
 * spent when the form is submitted, so a mail scanner that fetches the link
 * ahead of the person doesn't use it up.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const live = typeof token === "string" && (await resetLinkIsLive(token));

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <span className="text-[22px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </div>

        {live ? (
          <ResetForm token={token as string} minLength={MIN_PASSWORD_LENGTH} />
        ) : (
          <div className="w-full max-w-sm text-center">
            <h1 className="text-[17px] font-semibold text-[#0A1931]">This link no longer works</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#4A7FA7]">
              A reset link works once, for an hour. Ask for a new one and use it straight away.
            </p>
            <Link href="/forgot-password" className="mt-5 inline-block text-[13px] font-medium text-[#1A3D63] hover:underline">
              Send a new link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
