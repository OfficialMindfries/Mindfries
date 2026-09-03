"use client";

import { useState } from "react";
import clsx from "clsx";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import type { PreviewController } from "@/lib/ide/shell/types";
import { TerminalGroup } from "./TerminalGroup";

type PanelTab = "problems" | "output" | "debug" | "terminal" | "ports";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug", label: "Debug Console" },
  { id: "terminal", label: "Terminal" },
  { id: "ports", label: "Ports" },
];

export function BottomPanel({
  theme,
  vfs,
  preview,
}: {
  theme: IdeTheme;
  vfs: VfsBridge;
  preview: PreviewController;
}) {
  const palette = idePalette(theme);
  const [active, setActive] = useState<PanelTab>("terminal");

  return (
    <div className={clsx("flex h-full flex-col", palette.panelBg)}>
      <div className={clsx("flex h-7 shrink-0 items-stretch gap-0.5 border-b px-1.5 py-1", palette.border)}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={clsx(
              "rounded-[4px] px-2 text-[11px] font-medium tracking-wide uppercase",
              active === tab.id
                ? clsx(palette.active, palette.text)
                : clsx(palette.hover, palette.textMuted)
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {/* Kept mounted (just hidden) rather than unmounted while another tab is
            active, so terminal sessions and their scrollback survive tab switches. */}
        <div className="h-full" style={{ display: active === "terminal" ? "block" : "none" }}>
          <TerminalGroup theme={theme} vfs={vfs} preview={preview} />
        </div>
        {active === "problems" && (
          <EmptyState theme={theme} text="No problems have been detected in the workspace." />
        )}
        {active === "output" && <EmptyState theme={theme} text="No output yet." />}
        {active === "debug" && (
          <EmptyState theme={theme} text="Start a debug session to see the debug output." />
        )}
        {active === "ports" && (
          <EmptyState theme={theme} text="No forwarded ports. This workspace has no running server to forward." />
        )}
      </div>
    </div>
  );
}

function EmptyState({ theme, text }: { theme: IdeTheme; text: string }) {
  const palette = idePalette(theme);
  return (
    <div className={clsx("flex h-full items-center px-4 text-xs", palette.textMuted)}>{text}</div>
  );
}
