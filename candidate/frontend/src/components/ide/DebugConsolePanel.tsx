"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { Ban, ChevronRight, CornerDownLeft, RotateCcw } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { evaluateRepl, resetRepl } from "@/lib/ide/repl";

/**
 * The Debug Console: a real REPL, and an honest label saying it is only half
 * of what VS Code's Debug Console is.
 *
 * VS Code's version does two things — evaluate expressions, and do it *inside
 * a paused debugger*, with breakpoints, stepping and a call stack behind it.
 * There is no debug adapter here, so the second half doesn't exist. Rather
 * than dress the panel up as a debugger and let a candidate waste minutes
 * hunting for a breakpoint gutter that will never work, the header says so.
 *
 * The first half is real: expressions are evaluated by the browser's own
 * JavaScript engine, declarations persist between entries, `console.log` is
 * captured, and TypeScript is stripped by the real compiler when the JS
 * parser rejects the input.
 */

interface Entry {
  id: number;
  input: string;
  logs: string[];
  display: string | null;
  errored: boolean;
}

export function DebugConsolePanel({ theme }: { theme: IdeTheme }) {
  const palette = idePalette(theme);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // -1 means "editing a fresh line"; otherwise an index back through history.
  const [historyIndex, setHistoryIndex] = useState(-1);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries, busy]);

  const history = entries.map((entry) => entry.input);

  const submit = async () => {
    const input = draft.trim();
    if (!input || busy) return;
    setDraft("");
    setHistoryIndex(-1);
    setBusy(true);
    const outcome = await evaluateRepl(input);
    setEntries((prev) => [...prev, { id: nextId.current++, input, ...outcome }]);
    setBusy(false);
    inputRef.current?.focus();
  };

  const recall = (direction: -1 | 1) => {
    if (history.length === 0) return;
    const next =
      direction === -1
        ? Math.min(historyIndex + 1, history.length - 1)
        : Math.max(historyIndex - 1, -1);
    setHistoryIndex(next);
    setDraft(next === -1 ? "" : history[history.length - 1 - next]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter evaluates, Shift+Enter continues on a new line — the contract VS
    // Code's Debug Console and Node's REPL both use.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
      return;
    }
    // Arrows reach history from the first and last *lines*, not from the exact
    // ends of the text — otherwise recalling twice in a row fails, because
    // filling the input leaves the caret at the end rather than at position 0.
    // Inside a multi-line entry they still just move the caret.
    const element = event.currentTarget;
    const atStart = !element.value.slice(0, element.selectionStart).includes("\n");
    const atEnd = !element.value.slice(element.selectionEnd).includes("\n");
    if (event.key === "ArrowUp" && atStart) {
      event.preventDefault();
      recall(-1);
    } else if (event.key === "ArrowDown" && atEnd) {
      event.preventDefault();
      recall(1);
    }
  };

  const clearSession = () => {
    resetRepl();
    setEntries([]);
    setHistoryIndex(-1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" onClick={() => inputRef.current?.focus()}>
      <div className={clsx("flex h-7 shrink-0 items-center gap-2 border-b px-2.5", palette.border)}>
        <span className={clsx("text-[11px]", palette.textMuted)}>
          Evaluating without a debugger attached — no breakpoints, stepping or call stack.
        </span>
        <button
          type="button"
          title="Clear the console"
          onClick={(event) => {
            event.stopPropagation();
            setEntries([]);
          }}
          className={clsx("ml-auto rounded-md p-1", palette.hover)}
        >
          <Ban size={12} className={palette.textMuted} />
        </button>
        <button
          type="button"
          title="Reset the session (forget every declaration)"
          onClick={(event) => {
            event.stopPropagation();
            clearSession();
          }}
          className={clsx("rounded-md p-1", palette.hover)}
        >
          <RotateCcw size={12} className={palette.textMuted} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">
        {entries.length === 0 && (
          <div className={clsx("space-y-1 font-sans", palette.textMuted)}>
            <p>Evaluate an expression against the running page — try {"`2 ** 10`"} or {"`[1,2,3].map(n => n * n)`"}.</p>
            <p>
              Declarations persist, so {"`const user = { name: 'Rishi' }`"} on one line and {"`user.name`"} on the
              next both work. TypeScript is stripped by the real compiler, and {"`await`"} works at the top level.
            </p>
            <p>
              This session is its own runtime: it doesn&apos;t share variables with{" "}
              {"`node script.js`"} in the terminal, and there&apos;s no debugger behind it.
            </p>
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="mb-1">
            <div className={clsx("flex gap-1.5", palette.text)}>
              <ChevronRight size={12} className={clsx("mt-0.5 shrink-0", palette.accent)} />
              <pre className="whitespace-pre-wrap">{entry.input}</pre>
            </div>
            {entry.logs.map((line, index) => (
              <pre key={index} className={clsx("pl-[18px] whitespace-pre-wrap", palette.textMuted)}>
                {line}
              </pre>
            ))}
            {entry.display !== null && (
              <pre
                className={clsx(
                  "flex gap-1.5 pl-[18px] whitespace-pre-wrap",
                  entry.errored ? "text-[#E06C75]" : palette.text
                )}
              >
                {entry.errored ? entry.display : `‹ ${entry.display}`}
              </pre>
            )}
          </div>
        ))}

        {busy && <div className={clsx("pl-[18px]", palette.textMuted)}>evaluating…</div>}
      </div>

      <div className={clsx("flex shrink-0 items-start gap-1.5 border-t px-2.5 py-1.5", palette.border)}>
        <ChevronRight size={13} className={clsx("mt-[3px] shrink-0", palette.accent)} />
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Expression (Enter to evaluate, Shift+Enter for a new line)"
          className={clsx(
            "min-h-0 flex-1 resize-none bg-transparent font-mono text-[11px] leading-relaxed outline-none placeholder:font-sans placeholder:opacity-60",
            palette.text
          )}
        />
        <button
          type="button"
          title="Evaluate (Enter)"
          onClick={(event) => {
            event.stopPropagation();
            void submit();
          }}
          disabled={draft.trim().length === 0 || busy}
          className={clsx(
            "mt-[1px] shrink-0 rounded-md p-1",
            draft.trim().length === 0 || busy ? clsx(palette.textMuted, "opacity-50") : palette.hover
          )}
        >
          <CornerDownLeft size={12} />
        </button>
      </div>
    </div>
  );
}
