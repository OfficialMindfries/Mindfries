"use client";

import { useState } from "react";
import clsx from "clsx";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import type { PreviewController } from "@/lib/ide/shell/types";
import { TerminalGroup } from "./TerminalGroup";
import { CameraPanel } from "./CameraPanel";
import { ProblemsPanel } from "./ProblemsPanel";
import { OutputPanel } from "./OutputPanel";
import { PortsPanel } from "./PortsPanel";
import type { Diagnostic } from "@/lib/ide/diagnostics";
import { useResizable } from "@/lib/ide/use-resizable";

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
  cameraStream,
  diagnostics,
  onOpenLocation,
  previewState,
  onClosePreview,
  onStopPreview,
}: {
  theme: IdeTheme;
  vfs: VfsBridge;
  preview: PreviewController;
  cameraStream: MediaStream | null;
  diagnostics: Diagnostic[];
  onOpenLocation: (path: string, line: number) => void;
  previewState: { html: string; title: string; root: string; watching: boolean } | null;
  onClosePreview: () => void;
  onStopPreview: () => void;
}) {
  const palette = idePalette(theme);
  const [active, setActive] = useState<PanelTab>("terminal");
  const cameraPane = useResizable({ initial: 260, min: 160, max: 520, axis: "horizontal", invert: true });

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
            {tab.id === "problems" && diagnostics.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[#4A7FA7]/30 px-1.5 text-[10px]">
                {diagnostics.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {/* Kept mounted (just hidden) rather than unmounted while another tab is
              active, so terminal sessions and their scrollback survive tab switches. */}
          <div className="h-full" style={{ display: active === "terminal" ? "block" : "none" }}>
            <TerminalGroup
              theme={theme}
              vfs={vfs}
              preview={preview}
              previewState={previewState}
              onClosePreview={onClosePreview}
            />
          </div>
          {active === "problems" && (
            <ProblemsPanel theme={theme} diagnostics={diagnostics} onOpen={onOpenLocation} />
          )}
          {active === "output" && <OutputPanel theme={theme} />}
          {active === "debug" && (
            <EmptyState theme={theme} text="Start a debug session to see the debug output." />
          )}
          {active === "ports" && (
            <PortsPanel
              theme={theme}
              preview={previewState}
              // The preview lives beside the terminals, so "focus" means
              // switching to the tab it's rendered on.
              onFocusPreview={() => setActive("terminal")}
              onStopPreview={onStopPreview}
            />
          )}
        </div>

        {/* Outside the tab switch on purpose: the camera has to be visible on
            every tab, and mounting it here means the <video> element is never
            torn down, so switching tabs can't interrupt the feed. */}
        <div
          onMouseDown={cameraPane.startDrag}
          className={clsx(
            "flex w-1 shrink-0 cursor-col-resize items-center justify-center border-l",
            palette.border,
            palette.hover
          )}
        />
        <div style={{ width: cameraPane.size }} className="min-h-0 shrink-0">
          <CameraPanel theme={theme} stream={cameraStream} />
        </div>
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
