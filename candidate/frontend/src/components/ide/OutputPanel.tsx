"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Ban } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { output, type ChannelName } from "@/lib/ide/output";

/**
 * The Output panel: a channel dropdown plus that channel's log, matching how
 * VS Code presents tooling output.
 *
 * Read-only on purpose — commands are typed in the terminal; this is where
 * their tooling output is kept so it isn't interleaved with the shell.
 */
export function OutputPanel({ theme }: { theme: IdeTheme }) {
  const palette = idePalette(theme);
  const channels = useSyncExternalStore(output.subscribe, output.getSnapshot, output.getSnapshot);
  const [selected, setSelected] = useState<string | null>(null);

  const names = useMemo(
    () => Object.entries(channels).filter(([, lines]) => lines.length > 0).map(([name]) => name),
    [channels]
  );

  // Follow whichever channel is actually producing output until the user
  // picks one, so a build doesn't require hunting through the dropdown.
  const active = selected && names.includes(selected) ? selected : (names[0] ?? null);
  const lines = active ? (channels[active] ?? []) : [];

  if (names.length === 0) {
    return (
      <div className={clsx("flex h-full items-center px-4 text-xs", palette.textMuted)}>
        No output yet. Package installs, builds and git write here as they run.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={clsx("flex h-7 shrink-0 items-center gap-2 border-b px-2", palette.border)}>
        <select
          value={active ?? ""}
          onChange={(event) => setSelected(event.target.value)}
          className={clsx(
            "rounded-md border px-1.5 py-0.5 text-[11px] outline-none",
            palette.border,
            palette.panelBg,
            palette.text
          )}
        >
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className={clsx("text-[11px]", palette.textMuted)}>
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          title="Clear this channel"
          onClick={() => active && output.clear(active as ChannelName)}
          className={clsx("ml-auto rounded-md p-1", palette.hover)}
        >
          <Ban size={12} className={palette.textMuted} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-1.5">
        <pre className={clsx("font-mono text-[11px] leading-relaxed whitespace-pre-wrap", palette.text)}>
          {lines.join("\n")}
        </pre>
      </div>
    </div>
  );
}
