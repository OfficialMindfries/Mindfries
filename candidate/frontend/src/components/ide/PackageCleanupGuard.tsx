"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Package, Trash2 } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import { loadManifest, saveManifest, type InstalledPackage } from "@/lib/ide/packages";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";

/**
 * Asks whether to delete downloaded packages when the user leaves.
 *
 * An important browser limit to know about: a page CANNOT put custom buttons
 * in the close prompt. `beforeunload` only gets you the browser's own
 * two-button "Leave site? / Cancel" dialog — the text and buttons aren't
 * ours to set. That restriction exists so pages can't trap people in a tab.
 *
 * So this is split the only way it can be:
 *   1. `beforeunload` fires the browser's native prompt, whose Cancel button
 *      is what actually keeps the window open.
 *   2. If the user cancels (we're still alive on the next tick), we show our
 *      own dialog, which CAN offer all three choices.
 *
 * The prompt is only armed when packages actually exist, so a workspace
 * without downloads never nags.
 */
export function PackageCleanupGuard({ theme, vfs }: { theme: IdeTheme; vfs: VfsBridge }) {
  const palette = idePalette(theme);
  const [pending, setPending] = useState<InstalledPackage[] | null>(null);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const installed = Object.values(loadManifest());
      if (installed.length === 0) return;

      event.preventDefault();
      event.returnValue = "";

      // Timers are frozen while the native dialog is up. If this ever runs,
      // the user chose to stay — which is our cue to ask the real question.
      setTimeout(() => setPending(installed), 0);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
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
            Delete downloaded packages?
          </h2>
        </div>

        <div className="px-4 py-3 text-sm">
          <p className={palette.textMuted}>
            {pending.length} package{pending.length === 1 ? "" : "s"} downloaded into this browser
            will stay available next time unless you delete {pending.length === 1 ? "it" : "them"}:
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
            className={clsx("rounded-md px-3 py-1.5 text-xs", palette.hover, palette.textMuted)}
          >
            Cancel closing window
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className={clsx("rounded-md border px-3 py-1.5 text-xs", palette.border, palette.hover)}
          >
            Don&apos;t delete
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
