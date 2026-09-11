"use client";

import { useState } from "react";
import clsx from "clsx";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { TinyMarkdown } from "./tiny-markdown";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

interface TaskDescriptionPanelProps {
  theme: IdeTheme;
  /** Markdown string describing the assessment task. */
  taskMarkdown: string;
}

/**
 * Displays the assessment task instructions (PRD §1.6, left panel → Task
 * Description). Sits above the FileExplorer in the left sidebar, sharing
 * vertical space. The candidate can collapse it once they've read the
 * brief to reclaim the sidebar for the file tree.
 */
export function TaskDescriptionPanel({ theme, taskMarkdown }: TaskDescriptionPanelProps) {
  const palette = idePalette(theme);
  const [collapsed, setCollapsed] = useState(false);

  return (
    // Capped at half the sidebar, with the body as the part that scrolls.
    //
    // Without the cap this box was as tall as its text: the body's
    // `overflow-auto` never had anything to overflow, because its own height
    // grew to fit the brief, and the sidebar's `overflow-hidden` simply cut
    // off the rest — so the end of the brief was unreachable. It also pushed
    // the Explorer below it down to zero height, taking the file tree and the
    // End session control with it. `min-h-0` is what lets the body shrink
    // below its content so it can scroll; without it a flex child refuses to
    // be shorter than what's inside it.
    <div className={clsx("flex max-h-[50%] min-h-0 shrink-0 flex-col", palette.panelBg, palette.text)}>
      {/* Header — always visible, doubles as the collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
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

      {/* Body — scrollable task description, hidden when collapsed */}
      {!collapsed && (
        <div className={clsx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3", palette.textMuted)}>
          <TinyMarkdown text={taskMarkdown} />
        </div>
      )}
    </div>
  );
}

/**
 * Mock task description used until the backend provides real assessment
 * content. Written to feel like a genuine engineering problem, not a toy
 * example — the kind of task the PRD envisions (§1.3, §1.5).
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
