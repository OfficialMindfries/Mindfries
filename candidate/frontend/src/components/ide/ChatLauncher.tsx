"use client";

import clsx from "clsx";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * Floating launcher for the AI agents panel — the familiar bottom-right
 * bubble.
 *
 * It hides while the panel is open: the panel has its own close control, and
 * leaving the bubble up would put it on top of the panel it opens.
 */
export function ChatLauncher({
  theme,
  hidden,
  onClick,
}: {
  theme: IdeTheme;
  hidden: boolean;
  onClick: () => void;
}) {
  const palette = idePalette(theme);
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      title="AI agents"
      aria-label="Open AI agents"
      className={clsx(
        // Sits above the status bar rather than over it.
        "fixed right-4 bottom-8 z-40 flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition hover:scale-105",
        palette.border,
        "bg-[#F6FAFD]"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
      <img src="/mindfries-logo.svg" alt="" width={26} height={26} />

      {/* Status dot, sat on the circle's outline at the bottom right. The
          ring matches the page behind it so the dot reads as attached to the
          edge rather than floating over it. */}
      <span
        className={clsx(
          "absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 bg-[#4A7FA7]",
          theme === "dark" ? "border-[#1A3D63]" : "border-[#F6FAFD]"
        )}
      />
    </button>
  );
}
