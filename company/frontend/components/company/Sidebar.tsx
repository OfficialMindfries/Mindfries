"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CreditCard, LayoutDashboard, LogOut, Users, UsersRound, type LucideIcon } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { companyRoleLabel } from "@/lib/format";
import type { CompanyRole } from "@/lib/types";

/**
 * The company's left rail — same shape as internal-admin's
 * components/admin/Sidebar.tsx, nav items swapped for the Company Portal's
 * own route map (IMPLEMENTATION.md §8: no [companyId] segment, everything
 * resolved from the session).
 */

type Item = { href: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/roles", label: "Roles", icon: Briefcase },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/settings/team", label: "Team", icon: UsersRound },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
];

/** "Chandan Giri" → "CG"; a single name → its first two letters. */
function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? w[0]?.[1] ?? "")).toUpperCase();
}

export function Sidebar({ user }: { user: { name: string; email: string; role: CompanyRole; companyName: string } }) {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-hair bg-surface">
      <Link href="/dashboard" className="flex items-center gap-3 px-5 pt-6 pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static local SVG, nothing to optimise */}
        <img src="/mindfries-logo.svg" alt="" width={36} height={36} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold leading-none tracking-tight">Mindfries</div>
          <div className="eyebrow mt-1.5 truncate" title={user.companyName || undefined}>
            {user.companyName || "Company Portal"}
          </div>
        </div>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]" aria-label="Company">
        <ul className="space-y-0.5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
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
      </nav>

      <div className="border-t border-hair p-3">
        <div className="flex items-center gap-3 rounded-xl px-2.5 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-dim" title={user.email}>
              {companyRoleLabel[user.role]}
            </div>
          </div>
          {/* A real sign-out: the server clears the cookie. */}
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
