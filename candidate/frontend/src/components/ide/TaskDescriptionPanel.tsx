"use client";

import clsx from "clsx";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { TinyMarkdown } from "./tiny-markdown";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

interface TaskDescriptionPanelProps {
  theme: IdeTheme;
  /** Markdown string describing the assessment task. */
  taskMarkdown: string;
  /**
   * Controlled from IdeShell rather than held here, because the Explorer
   * below sizes itself differently depending on it — see IdeShell's sidebar.
   */
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Displays the assessment task instructions (PRD §1.6, left panel → Task
 * Description). Sits above the FileExplorer in the left sidebar.
 *
 * Expanded, it takes every pixel the Explorer doesn't need: the Explorer is
 * only as tall as its files and the candidate row, so with a near-empty
 * workspace the brief runs almost to the bottom of the sidebar. Collapsed,
 * it's just its header, and the Explorer takes the rest.
 */
export function TaskDescriptionPanel({
  theme,
  taskMarkdown,
  collapsed,
  onToggle,
}: TaskDescriptionPanelProps) {
  const palette = idePalette(theme);

  return (
    // `min-h-0` is what lets the body be shorter than the brief and scroll.
    // Without it a flex child refuses to shrink below its content: the body
    // grows to the full length of the text, its `overflow-y-auto` never has
    // anything to overflow, and the sidebar's `overflow-hidden` just cuts the
    // end of the brief off.
    <div
      className={clsx(
        "flex flex-col",
        collapsed ? "shrink-0" : "min-h-0 flex-1",
        palette.panelBg,
        palette.text
      )}
    >
      {/* Header — always visible, doubles as the collapse toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={clsx(
          "flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase",
          palette.border,
          palette.textMuted,
          palette.hover
        )}
      >
        <span className="flex items-center gap-1.5">
          <BookOpen size={14} className={palette.accent} />
          Task
        </span>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Body — scrolls, with the scrollbar itself hidden.
          Hiding the bar removes the one cue that there's more below, so two
          things stand in for it: the last lines fade out at the bottom edge,
          and the region is focusable, so the brief can still be scrolled
          from the keyboard. The extra bottom padding lets the final line
          clear the fade once you've scrolled all the way down. */}
      {!collapsed && (
        <div
          tabIndex={0}
          role="region"
          aria-label="Task brief"
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-8 outline-none",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]",
            palette.textMuted
          )}
        >
          <TinyMarkdown text={taskMarkdown} />
        </div>
      )}
    </div>
  );
}

/**
 * Shown when the workspace is opened without a session — directly at /ide.
 * There is no assessment here, so there is no task to describe; this says
 * that, rather than presenting a made-up one as if it were being scored.
 */
export const SCRATCH_MARKDOWN = `# Scratch workspace

This workspace isn't attached to an assessment. Nothing you do here is timed, recorded or submitted.

Use it to get used to the editor and terminal. To work on a real task, start an assessment from your dashboard.`;

/**
 * Shown for a real session whose template has no `task_brief` authored yet
 * — distinct from SCRATCH_MARKDOWN above on purpose: this is a real
 * assessment, so showing sample content here would silently misrepresent
 * what the candidate is actually being asked to do. Says so plainly instead.
 */
export const NO_BRIEF_MARKDOWN = `# No task brief yet

This assessment doesn't have a task description set up yet — that's a setup gap on our end, not something you're missing.

Reach out to whoever invited you before spending time here.`;
