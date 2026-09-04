"use client";

import clsx from "clsx";
import { Circle, ExternalLink, PanelBottom, Square } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * The Ports view.
 *
 * VS Code lists *locally-running services* and forwards them over dev
 * tunnels. A browser tab cannot listen on a port, so there is genuinely
 * nothing to forward here — real forwarding needs the sandbox (PRD §2.3).
 *
 * What does exist is the running dev preview, which is the thing a port row
 * would point at. So this lists that, with the actions that actually apply,
 * and the empty state explains the limitation rather than just saying "none"
 * — a candidate who runs `npm run dev` and finds an empty Ports tab deserves
 * to know why, not to assume it is broken.
 *
 * The Port column reads "—" on purpose. Inventing a plausible number (5173,
 * say) would be a lie the rest of this workspace doesn't tell.
 */
export function PortsPanel({
  theme,
  preview,
  onFocusPreview,
  onStopPreview,
}: {
  theme: IdeTheme;
  preview: { title: string; root: string; watching: boolean; html: string } | null;
  onFocusPreview: () => void;
  onStopPreview: () => void;
}) {
  const palette = idePalette(theme);

  if (!preview) {
    return (
      <div className={clsx("space-y-1.5 px-4 py-3 text-xs", palette.textMuted)}>
        <p className={palette.text}>No running preview.</p>
        <p>
          Start one with <code className="font-mono">npm run dev</code> and it appears here.
        </p>
        <p className="opacity-80">
          Real port forwarding needs a machine that can listen on a port — a browser tab can&apos;t,
          so this lists the in-editor preview instead.
        </p>
      </div>
    );
  }

  const openInTab = () => {
    // The built page references blob: module URLs created by this document,
    // so the new tab must share this origin to load them — which a blob:
    // document opened from here does.
    const url = URL.createObjectURL(new Blob([preview.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    // Revoked on a delay: revoking immediately can race the new tab's load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="h-full overflow-auto text-xs">
      <div
        className={clsx(
          "grid grid-cols-[4rem_1fr_9rem_auto] items-center gap-2 border-b px-3 py-1.5",
          palette.border,
          palette.textMuted
        )}
      >
        <span>Port</span>
        <span>Address</span>
        <span>Status</span>
        <span />
      </div>

      <div className="grid grid-cols-[4rem_1fr_9rem_auto] items-center gap-2 px-3 py-2">
        <span className={palette.textMuted} title="No port is bound — see below">
          —
        </span>
        <span className="min-w-0">
          <span className={clsx("block truncate", palette.text)}>in-editor preview</span>
          <span className={clsx("block truncate text-[11px]", palette.textMuted)}>
            {preview.root || "workspace"}
          </span>
        </span>
        <span className={clsx("flex items-center gap-1.5", preview.watching ? palette.accent : palette.textMuted)}>
          <Circle size={8} className={preview.watching ? "fill-current" : ""} />
          {preview.watching ? "running" : "stopped"}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            title="Show the preview panel"
            onClick={onFocusPreview}
            className={clsx("rounded-md p-1", palette.hover)}
          >
            <PanelBottom size={13} />
          </button>
          <button
            type="button"
            title="Open the built page in a new tab"
            onClick={openInTab}
            className={clsx("rounded-md p-1", palette.hover)}
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            title={preview.watching ? "Stop watching" : "Already stopped"}
            onClick={onStopPreview}
            disabled={!preview.watching}
            className={clsx("rounded-md p-1", preview.watching ? palette.hover : "opacity-40")}
          >
            <Square size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}
