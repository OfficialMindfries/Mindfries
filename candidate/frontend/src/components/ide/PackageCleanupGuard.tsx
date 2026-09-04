"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Package, Trash2 } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import { loadManifest, saveManifest, type InstalledPackage } from "@/lib/ide/packages";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";

/** Per-tab marker. `sessionStorage` survives reloads but dies with the tab. */
const SESSION_MARKER = "mindfries.ide.session";

let resumedSession: boolean | null = null;

/**
 * Whether this page load is a continuation of a session already in progress.
 *
 * Memoized at module scope, which is load-bearing rather than an
 * optimization: React mounts effects twice in development, and a check that
 * wrote the marker on the first mount would report "resumed" to the second
 * one and swallow the dialog entirely. Deciding once per page load means both
 * mounts get the same answer.
 */
function isResumedSession(): boolean {
  if (resumedSession !== null) return resumedSession;
  try {
    resumedSession = sessionStorage.getItem(SESSION_MARKER) !== null;
    sessionStorage.setItem(SESSION_MARKER, String(Date.now()));
  } catch {
    // Storage can be blocked outright. Staying quiet is the right failure: a
    // dialog on every refresh would be worse than never asking.
    resumedSession = true;
  }
  return resumedSession;
}

/**
 * Asks whether to keep the packages downloaded in a previous session.
 *
 * ## Why this asks on the way in, not on the way out
 *
 * The obvious design is to ask while the tab is closing. It can't be done,
 * and the reason is worth knowing: a page cannot put custom buttons in the
 * close prompt. `beforeunload` yields the browser's own "Leave site? /
 * Cancel" dialog and nothing else — the text and the buttons aren't ours to
 * set. That restriction is deliberate; it's what stops a page trapping
 * someone in a tab.
 *
 * This used to fire `beforeunload` anyway and show our dialog to whoever
 * cancelled it. That works, but it means every exit is met with a browser
 * warning the workspace didn't want and can't style — a native dialog to get
 * to a real one. Not worth it for a question about cached downloads.
 *
 * So the question moves to the one moment we own completely: opening the
 * workspace. Packages live in browser storage, so nothing is lost by asking
 * later, and asking here is arguably the more useful time — the candidate can
 * see what a previous session left behind before starting work on top of it.
 *
 * The session marker keeps a reload from re-asking: `sessionStorage` survives
 * refreshes within a tab and is gone once the tab closes, so this fires once
 * per session, and only when there is actually something to clean up.
 */
export function PackageCleanupGuard({ theme, vfs }: { theme: IdeTheme; vfs: VfsBridge }) {
  const palette = idePalette(theme);
  const [pending, setPending] = useState<InstalledPackage[] | null>(null);

  useEffect(() => {
    if (isResumedSession()) return;

    const installed = Object.values(loadManifest());
    if (installed.length === 0) return;

    // Deferred a tick so the workspace paints first and the dialog arrives
    // over a workspace, rather than being part of the mount render.
    const timer = setTimeout(() => setPending(installed), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!pending) return null;

  const deletePackages = () => {
    saveManifest({});
    // Also drop the node_modules/ mirror, so "deleted" means gone from the
    // Explorer too and not just from browser storage.
    vfs.remove("node_modules", true);
    setPending(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cleanup-title"
        className={clsx(
          "w-full max-w-md overflow-hidden rounded-xl border shadow-2xl",
          palette.border,
          palette.appBg,
          palette.text
        )}
      >
        <div className={clsx("flex items-center gap-2 border-b px-4 py-3", palette.border)}>
          <Package size={16} className={palette.accent} />
          <h2 id="cleanup-title" className="text-sm font-semibold">
            Packages from a previous session
          </h2>
        </div>

        <div className="px-4 py-3 text-sm">
          <p className={palette.textMuted}>
            {pending.length} package{pending.length === 1 ? "" : "s"} {pending.length === 1 ? "is" : "are"}{" "}
            still downloaded in this browser. Keep {pending.length === 1 ? "it" : "them"} and{" "}
            {pending.length === 1 ? "it stays" : "they stay"} importable straight away, or start clean:
          </p>
          <ul className="mt-2 max-h-40 overflow-auto">
            {pending.map((pkg) => (
              <li key={pkg.name} className="py-0.5 font-mono text-xs">
                {pkg.name}@{pkg.version}
              </li>
            ))}
          </ul>
          <p className={clsx("mt-3 text-xs", palette.textMuted)}>
            Python packages installed with pip aren&apos;t stored — they already reset when the
            page closes.
          </p>
        </div>

        <div className={clsx("flex flex-wrap justify-end gap-2 border-t px-4 py-3", palette.border)}>
          <button
            type="button"
            onClick={() => setPending(null)}
            className={clsx("rounded-md border px-3 py-1.5 text-xs", palette.border, palette.hover)}
          >
            Keep {pending.length === 1 ? "it" : "them"}
          </button>
          <button
            type="button"
            onClick={deletePackages}
            className="flex items-center gap-1.5 rounded-md bg-[#4A7FA7] px-3 py-1.5 text-xs font-medium text-[#F6FAFD] hover:opacity-90"
          >
            <Trash2 size={13} />
            Yes, delete
          </button>
        </div>
      </div>
    </div>
  );
}
