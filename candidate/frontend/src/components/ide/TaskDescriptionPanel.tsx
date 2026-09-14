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
 * Sample task description shown only when there's no real session to fetch
 * a real brief for — opening `/ide` directly, or onboarding's own honest
 * fallback when the backend isn't configured (see IdeShell's own doc
 * comment on `sessionId`). A real session with a real
 * `game_templates.task_brief` authored shows that instead
 * (GET /sessions/{id}/assessment); a real session whose template has none
 * authored yet shows NO_BRIEF_MARKDOWN below, not this — showing this
 * content for a real assessment would be exactly the "looks connected and
 * isn't" bug this used to be everywhere. Written to feel like a genuine
 * engineering problem, not a toy example, since it's still what a candidate
 * sees while exploring without a tracked session.
 */
export const MOCK_TASK_MARKDOWN = `# Authentication Bug Fix

## Context

You are working on a Node.js REST API for a task management application. The authentication middleware has a bug that allows expired JWT tokens to pass validation under certain conditions.

## Objective

- Identify the bug in the authentication middleware
- Write a fix that correctly rejects expired tokens
- Add at least one test case that reproduces the original bug
- Make sure all existing tests still pass

## Constraints

- **Time limit**: shown in the header above
- **You may use the AI assistant** for help — how you use it is part of the evaluation
- Use the terminal to run tests: \`npm test\`

## Getting Started

- Read through \`src/middleware/auth.js\`
- Check the existing tests in \`tests/auth.test.js\`
- The bug is in the token expiry check

## Evaluation

Your work will be evaluated on:
- **Correctness** — does the fix actually solve the problem?
- **Process** — how you approached debugging (explored the codebase, reproduced the issue, validated the fix)
- **Code quality** — clean, readable changes
- **Testing** — did you verify your fix with tests?
`;

/**
 * Shown for a real session whose template has no `task_brief` authored yet
 * — distinct from MOCK_TASK_MARKDOWN above on purpose: this is a real
 * assessment, so showing sample content here would silently misrepresent
 * what the candidate is actually being asked to do. Says so plainly instead.
 */
export const NO_BRIEF_MARKDOWN = `# No task brief yet

This assessment doesn't have a task description set up yet — that's a setup gap on our end, not something you're missing.

Reach out to whoever invited you before spending time here.`;
