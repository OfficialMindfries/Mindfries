"use client";

import clsx from "clsx";
import { CheckCircle2, LogOut, Trash2 } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { InstalledPackage } from "@/lib/ide/packages";

/**
 * Ending the session on the candidate's own terms.
 *
 * This exists because the browser's close prompt can't be ours: a page cannot
 * put custom buttons in the "Leave site?" dialog, by design, since that's what
 * stops a page trapping someone in a tab. The way to get a real confirmation
 * with real choices is to own the exit — a control inside the workspace,
 * pressed deliberately, with no browser dialog anywhere near it.
 *
 * Which is also why the flow stops at a closing screen instead of closing the
 * tab: `window.close()` only works on a window a script opened itself. The
 * screen says the session is over and leaves the tab to the person.
 *
 * Finality is a client-side gesture for now. A real assessment ends when the
 * server says it ended (PRD §2.3) — until the backend exists, this stops the
 * camera and closes the workspace, and nothing has been recorded anywhere.
 */

export function EndSessionDialog({
  theme,
  packages,
  onCancel,
  onEnd,
}: {
  theme: IdeTheme;
  packages: InstalledPackage[];
  onCancel: () => void;
  onEnd: (deletePackages: boolean) => void;
}) {
  const palette = idePalette(theme);
  const hasPackages = packages.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        className={clsx(
          "w-full max-w-md overflow-hidden rounded-xl border shadow-2xl",
          palette.border,
          palette.appBg,
          palette.text
        )}
      >
        <div className={clsx("flex items-center gap-2 border-b px-4 py-3", palette.border)}>
          <LogOut size={16} className={palette.accent} />
          <h2 id="end-session-title" className="text-sm font-semibold">
            End this session?
          </h2>
        </div>

        <div className="px-4 py-3 text-sm">
          <p className={palette.textMuted}>
            Your camera stops and the workspace closes. Files you&apos;ve written stay in this
            browser.
          </p>

          {hasPackages && (
            <>
              <p className={clsx("mt-3", palette.textMuted)}>
                {packages.length} package{packages.length === 1 ? "" : "s"} downloaded during this
                session {packages.length === 1 ? "is" : "are"} still stored here:
              </p>
              <ul className="mt-2 max-h-32 overflow-auto">
                {packages.map((pkg) => (
                  <li key={pkg.name} className="py-0.5 font-mono text-xs">
                    {pkg.name}@{pkg.version}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={clsx("flex flex-wrap justify-end gap-2 border-t px-4 py-3", palette.border)}>
          <button
            type="button"
            onClick={onCancel}
            className={clsx("rounded-md px-3 py-1.5 text-xs", palette.hover, palette.textMuted)}
          >
            Cancel
          </button>

          {/* With packages present this is a three-way choice, which is the
              whole point of owning the exit: end and keep, end and delete, or
              don't end. None of that fits in a browser close prompt. */}
          <button
            type="button"
            onClick={() => onEnd(false)}
            className={clsx("rounded-md border px-3 py-1.5 text-xs", palette.border, palette.hover)}
          >
            {hasPackages ? "End, keep packages" : "End session"}
          </button>

          {hasPackages && (
            <button
              type="button"
              onClick={() => onEnd(true)}
              // Red to match the control that opened this dialog, and because
              // it's the only button here that destroys something.
              //
              // #AD2934 rather than the #E06C75 used on the trigger: that one
              // is the same hue darkened to L 42%, which is what lets
              // #F6FAFD sit on it at 6.4:1. #E06C75 as a fill would put white
              // text at 2.9:1 — the light tone is for text and icons on a
              // neutral background, the dark one for white-on-red fills.
              className="flex items-center gap-1.5 rounded-md bg-[#AD2934] px-3 py-1.5 text-xs font-medium text-[#F6FAFD] hover:opacity-90"
            >
              <Trash2 size={13} />
              End &amp; delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SessionEnded({ theme, deleted }: { theme: IdeTheme; deleted: boolean }) {
  const palette = idePalette(theme);

  return (
    <div className={clsx("flex h-screen w-full items-center justify-center p-6", palette.appBg)}>
      <div className={clsx("max-w-sm text-center", palette.text)}>
        <CheckCircle2 size={28} className={clsx("mx-auto", palette.accent)} />
        <h1 className="mt-3 text-base font-semibold">Session ended</h1>
        <p className={clsx("mt-2 text-sm leading-relaxed", palette.textMuted)}>
          The camera is off and recording has stopped. Your files are still saved in this browser
          {deleted ? ", and the packages you downloaded have been deleted" : ""}.
        </p>
        <p className={clsx("mt-3 text-xs", palette.textMuted)}>You can close this tab now.</p>
      </div>
    </div>
  );
}
