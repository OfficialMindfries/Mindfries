"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NotificationBell } from "./NotificationBell";
import { AccountMenu } from "./AccountMenu";

/**
 * Top bar, following Eightfold's shape: wordmark, a short set of sections,
 * then notifications and the avatar. Deliberately not the IDE's chrome — the
 * workspace is a dark, dense tool, and this is the calm surface around it.
 *
 * The active section is underlined rather than filled, so the bar stays quiet
 * and the page below is what carries colour.
 *
 * A client component so the active tab is read from the real URL via
 * usePathname — Assessments and Profile are now real pages at /assessments
 * and /profile, not both pointing at /dashboard with Dashboard permanently
 * lit.
 */

const SECTIONS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Assessments", href: "/assessments" },
  { label: "Profile", href: "/profile" },
];

interface DashboardNavProps {
  /** The signed-in candidate's real name, read server-side from the session by whichever page renders this — threaded down to AccountMenu so the avatar/menu never disagrees with the page's own greeting. */
  sessionName?: string;
}

export function DashboardNav({ sessionName }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[#B3CFE5] bg-[#F6FAFD]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5 sm:px-8">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={26} height={26} />
          <span className="text-[15px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {SECTIONS.map((section) => {
            const active = pathname === section.href;
            return (
              <Link
                key={section.label}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "font-medium text-[#0A1931]"
                    : "text-[#4A7FA7] hover:bg-[#B3CFE5]/30 hover:text-[#1A3D63]"
                )}
              >
                {section.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-[#1A3D63]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <AccountMenu sessionName={sessionName} />
        </div>
      </div>
    </header>
  );
}
