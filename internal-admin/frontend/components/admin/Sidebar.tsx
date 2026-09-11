"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, CircleDollarSign, Crosshair, LayoutDashboard, LibraryBig, LogOut, MonitorPlay, Radar, Rocket,
  UserPlus, type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/login/actions";

/**
 * The admin's left rail.
 *
 * Grouped by what the pages are for, rather than one flat list of nine:
 * finding and signing companies (Growth) is a different job from running the
 * product they use (Product), and the labels let the eye jump to the right
 * half. Icons are lucide — the same set the candidate app uses — each chosen
 * to say what the page does, not just to fill the space.
 */

type Item = { href: string; label: string; icon: LucideIcon };

/** "Chandan Giri" → "CG"; a single name → its first two letters. */
function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? w[0]?.[1] ?? "")).toUpperCase();
}

const SECTIONS: { title: string | null; items: Item[] }[] = [
  { title: null, items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] },
  {
    title: "Growth",
    items: [
      { href: "/admin/tracker", label: "Tracker", icon: Radar }, // the crawler, sweeping for companies
      { href: "/admin/targets", label: "Targets", icon: Crosshair }, // hand-picked, aimed at
      { href: "/admin/waitlist", label: "Waitlist", icon: UserPlus }, // people signing up
      { href: "/admin/onboarding", label: "Onboarding", icon: Rocket }, // a company going live
      { href: "/admin/costs", label: "Costs", icon: CircleDollarSign },
    ],
  },
  {
    title: "Product",
    items: [
      { href: "/admin/companies", label: "Companies", icon: Building2 },
      { href: "/admin/library", label: "Game Library", icon: LibraryBig },
      { href: "/admin/sessions", label: "Sessions", icon: MonitorPlay }, // live candidate sessions
    ],
  },
];

export function Sidebar({ user }: { user: { name: string; email: string; role: string; root: boolean } }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-hair bg-surface">
      <Link href="/admin" className="flex items-center gap-3 px-5 pt-6 pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static local SVG, nothing to optimise */}
        <img src="/mindfries-logo.svg" alt="" width={36} height={36} className="shrink-0" />
        <div>
          <div className="text-[15px] font-extrabold leading-none tracking-tight">Mindfries</div>
          <div className="eyebrow mt-1.5">Internal Admin</div>
        </div>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]" aria-label="Admin">
        {SECTIONS.map((section, i) => (
          <div key={section.title ?? `section-${i}`}>
            {section.title && (
              <div className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-semibold transition ${
                        active ? "bg-accent-soft text-accent" : "text-dim hover:bg-black/[0.04] hover:text-ink"
                      }`}
                    >
                      {/* Active marker on the rail's edge. */}
                      {active && <span className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-accent" aria-hidden />}
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                          active
                            ? "bg-accent text-white shadow-[0_4px_12px_-4px_rgba(124,58,237,0.6)]"
                            : "bg-black/[0.04] text-dim group-hover:bg-black/[0.07] group-hover:text-ink"
                        }`}
                      >
                        <Icon size={16} strokeWidth={2.1} aria-hidden />
                      </span>
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-hair p-3">
        <div className="flex items-center gap-3 rounded-xl px-2.5 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-dim" title={user.email}>
              {user.email}
            </div>
          </div>
          {/* A real sign-out: the server clears the cookie. Navigating to
              /login on its own would leave the session valid. */}
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-black/[0.05] hover:text-ink"
            >
              <LogOut size={16} strokeWidth={2.1} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
