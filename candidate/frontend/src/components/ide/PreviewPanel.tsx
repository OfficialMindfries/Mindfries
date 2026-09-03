"use client";

import clsx from "clsx";
import { RotateCw, X } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * Renders a built preview in a sandboxed iframe.
 *
 * `allow-same-origin` is required, not incidental: the built modules are
 * `blob:` URLs created by this document, and a sandbox WITHOUT it gives the
 * frame an opaque origin that refuses to load them — the page just comes up
 * blank with no error in the parent. (Verified both ways.)
 *
 * The trade-off is that previewed code can reach this origin's storage. That
 * matches the boundary the IDE already works to: `node app.js` runs the
 * user's code in the page itself, so an iframe with its own document is if
 * anything more contained, not less. It's the user's own code, in their own
 * browser.
 */
export function PreviewPanel({
  theme,
  html,
  title,
  onClose,
  onReload,
}: {
  theme: IdeTheme;
  html: string;
  title: string;
  onClose: () => void;
  onReload: () => void;
}) {
  const palette = idePalette(theme);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={clsx(
          "flex h-8 shrink-0 items-center justify-between border-b px-2 text-xs",
          palette.border,
          palette.panelBg
        )}
      >
        <span className={palette.textMuted}>
          Preview — <span className={palette.text}>{title}</span>
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            title="Rebuild and reload"
            onClick={onReload}
            className={clsx("rounded-md p-1", palette.hover)}
          >
            <RotateCw size={13} />
          </button>
          <button
            type="button"
            title="Close preview"
            onClick={onClose}
            className={clsx("rounded-md p-1", palette.hover)}
          >
            <X size={13} />
          </button>
        </span>
      </div>
      <iframe
        // Remounts on rebuild so the new modules actually load.
        key={html.length + title}
        title={`Preview of ${title}`}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
        className="min-h-0 flex-1 border-0 bg-white"
      />
    </div>
  );
}
