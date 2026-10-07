"use client";

import clsx from "clsx";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { FileChange } from "@/lib/ide/changes";

const BADGE: Record<FileChange["status"], { letter: string; label: string; tone: string }> = {
  added: { letter: "A", label: "Added", tone: "text-emerald-500" },
  modified: { letter: "M", label: "Modified", tone: "text-amber-500" },
  deleted: { letter: "D", label: "Deleted", tone: "text-red-400" },
};

/**
 * The Changes panel: every file that differs from the task as it was handed
 * over, with how many lines went in and out. Clicking one opens it as a
 * side-by-side diff against the original.
 *
 * It answers "what have I actually changed?" without needing git — the
 * comparison is with the task's starting files, so it's complete whether or
 * not anything was committed (see lib/ide/changes.ts).
 */
export function ChangesPanel({ theme, changes, onOpenDiff }: { theme: IdeTheme; changes: FileChange[]; onOpenDiff: (path: string) => void }) {
  const palette = idePalette(theme);

  if (changes.length === 0) {
    return (
      <div className={clsx("flex h-full items-center px-4 text-xs", palette.textMuted)}>
        No changes yet. Files you edit, add or delete are listed here, each with a diff against how the task started.
      </div>
    );
  }

  const added = changes.reduce((n, c) => n + c.added, 0);
  const removed = changes.reduce((n, c) => n + c.removed, 0);

  return (
    <div className={clsx("flex h-full min-h-0 flex-col text-xs", palette.text)}>
      <div className={clsx("shrink-0 border-b px-3 py-1.5", palette.border, palette.textMuted)}>
        {changes.length} file{changes.length === 1 ? "" : "s"} changed since the task started ·{" "}
        <span className="text-emerald-500">+{added}</span> <span className="text-red-400">−{removed}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {changes.map((change) => {
          const badge = BADGE[change.status];
          return (
            <li key={change.path}>
              <button
                type="button"
                onClick={() => onOpenDiff(change.path)}
                title={`${badge.label} — open the diff`}
                className={clsx("flex w-full items-center gap-2.5 px-3 py-1 text-left", palette.hover)}
              >
                <span className={clsx("w-3 font-mono font-semibold", badge.tone)}>{badge.letter}</span>
                <span className={clsx("font-mono", change.status === "deleted" && "line-through opacity-70")}>{change.path}</span>
                <span className="ml-auto font-mono tabular-nums">
                  {change.added > 0 && <span className="text-emerald-500">+{change.added}</span>}
                  {change.added > 0 && change.removed > 0 && " "}
                  {change.removed > 0 && <span className="text-red-400">−{change.removed}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
