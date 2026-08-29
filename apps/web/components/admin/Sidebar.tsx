"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const nav = [
  { href: "/admin", label: "Overview", icon: "◆" },
  { href: "/admin/companies", label: "Companies", icon: "▦" },
  { href: "/admin/library", label: "Game Library", icon: "◈" },
  { href: "/admin/sessions", label: "Sessions", icon: "◉" },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-hair bg-surface">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="tile tile-violet h-9 w-9 text-lg font-black">M</div>
        <div>
          <div className="text-sm font-extrabold leading-none tracking-tight">Mindfries</div>
          <div className="eyebrow mt-1">Internal Admin</div>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {nav.map((n) => {
          const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-accent-soft text-accent" : "text-dim hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              <span className="w-4 text-center opacity-80">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hair p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">DS</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Disha Sahu</div>
            <div className="truncate text-xs text-dim">Mindfries Ops · Admin</div>
          </div>
          <button
            onClick={() => router.push("/login")}
            title="Sign out"
            className="rounded-lg px-2 py-1 text-dim hover:bg-black/5"
          >
            ⎋
          </button>
        </div>
      </div>
    </aside>
  );
}
