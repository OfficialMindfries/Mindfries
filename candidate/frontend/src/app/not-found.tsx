import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found · Mindfries" };

/**
 * What a candidate sees for an address that isn't theirs or isn't anything:
 * a mistyped link, a session or report id that belongs to someone else (the
 * pages call notFound() rather than say which), a page that was moved.
 *
 * It says the same thing in every one of those cases on purpose — telling a
 * wrong id from someone else's id would say which ids exist.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F6FAFD] px-6 text-center">
      <p className="text-[13px] font-semibold tracking-[0.18em] text-[#4A7FA7] uppercase">Mindfries</p>
      <h1 className="mt-4 text-[26px] font-semibold tracking-tight text-[#0A1931]">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#4A7FA7]">
        The link may be mistyped, or it points at something that isn&apos;t part of your account. Your assessments and reports are all on your dashboard.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#1A3D63] px-5 py-2.5 text-[13px] font-semibold text-[#F6FAFD] transition-opacity hover:opacity-90"
      >
        Go to your dashboard
      </Link>
    </main>
  );
}
