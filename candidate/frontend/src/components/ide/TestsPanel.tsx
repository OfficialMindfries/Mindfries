"use client";

import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { CircleCheck, CircleMinus, CircleX, Play } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import type { PreviewController } from "@/lib/ide/shell/types";
import { createSession } from "@/lib/ide/shell/types";
import { executeCommandLine } from "@/lib/ide/shell/execute";
import { terminalLog } from "@/lib/ide/terminal-log";
import { testCommandFor, testResults, type TestCase } from "@/lib/ide/test-results";

/**
 * The Tests panel: the last test run, as results rather than as a wall of
 * terminal output — which tests there were, which failed, and what each
 * failure said.
 *
 * It shows whatever the last test run was, wherever it was started: typing
 * `python -m unittest` or `node --test` in the terminal fills this in just
 * as the Run button here does. The button runs the project's test command
 * through the same shell engine the terminal uses, from the workspace root.
 *
 * Nothing here is computed: every line is read from what the test runner
 * printed (lib/ide/test-results.ts). A run whose output can't be read is
 * shown as its exit code and raw output, never as a pass.
 */
export function TestsPanel({ theme, vfs, preview }: { theme: IdeTheme; vfs: VfsBridge; preview: PreviewController }) {
  const palette = idePalette(theme);
  const run = useSyncExternalStore(testResults.subscribe, testResults.getSnapshot, testResults.getSnapshot);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | undefined>();
  const [open, setOpen] = useState<string | null>(null);

  const runTests = async () => {
    const command = testCommandFor(Object.keys(vfs.getSnapshot().files));
    if (!command) {
      setNote("No test files found. This looks for Python test_*.py files and JavaScript or TypeScript *.test.js / *.test.ts files.");
      return;
    }
    setNote(undefined);
    setRunning(true);
    // Run the way the terminal would, so the run is recorded the same way:
    // it reaches the terminal log's listeners, which is what fills this
    // panel and what telemetry hears.
    const session = createSession();
    const tracked = terminalLog.begin(command);
    try {
      await executeCommandLine(command, session, vfs, { write: (text) => tracked.output(text), clear: () => undefined, preview });
    } catch (err) {
      tracked.output(`${err instanceof Error ? err.message : String(err)}\n`);
      session.lastExit = 1;
    } finally {
      tracked.finish(session.lastExit);
      setRunning(false);
    }
  };

  const failing = run?.tests.filter((t) => t.status === "fail" || t.status === "error") ?? [];
  const others = run?.tests.filter((t) => t.status !== "fail" && t.status !== "error") ?? [];

  return (
    <div className={clsx("flex h-full min-h-0 flex-col text-xs", palette.text)}>
      <div className={clsx("flex shrink-0 items-center gap-3 border-b px-3 py-1.5", palette.border)}>
        <button
          type="button"
          onClick={() => void runTests()}
          disabled={running}
          className={clsx("flex items-center gap-1.5 rounded-md px-2 py-1 font-medium disabled:opacity-50", palette.hover)}
        >
          <Play size={11} /> {running ? "Running…" : "Run tests"}
        </button>
        {run && !running && (
          <span className={palette.textMuted}>
            {run.parsed ? (
              <>
                <span className={run.failed > 0 ? "font-semibold text-red-400" : "font-semibold text-emerald-500"}>
                  {run.failed > 0 ? `${run.failed} failed` : "All passed"}
                </span>
                {" · "}
                {run.passed} passed
                {run.skipped > 0 && ` · ${run.skipped} skipped`}
              </>
            ) : (
              <span className={run.exitCode === 0 ? "" : "font-semibold text-red-400"}>exited {run.exitCode}</span>
            )}
            {" · "}
            <span className="font-mono">{run.command}</span>
            {" · "}
            {new Date(run.at).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {note && <p className={palette.textMuted}>{note}</p>}
        {!run && !note && (
          <p className={palette.textMuted}>
            No tests have been run yet. Run them here, or from the terminal — the results show up either way.
          </p>
        )}
        {run && !run.parsed && (
          <>
            <p className={palette.textMuted}>
              That run&apos;s output wasn&apos;t in a form this panel can read into results, so here it is as it was printed.
            </p>
            <pre className="mt-2 font-mono whitespace-pre-wrap">{run.tail}</pre>
          </>
        )}
        {run?.parsed && run.tests.length === 0 && run.failed + run.passed > 0 && (
          <p className={palette.textMuted}>
            The run didn&apos;t name its tests individually. Run with <span className="font-mono">-v</span> to see each one.
          </p>
        )}
        {run?.parsed && run.tests.length === 0 && run.failed + run.passed === 0 && (
          <pre className="font-mono whitespace-pre-wrap">{run.tail}</pre>
        )}
        <ul className="space-y-0.5">
          {[...failing, ...others].map((test, index) => (
            <TestRow
              key={`${test.name}-${index}`}
              test={test}
              open={open === test.name}
              onToggle={() => setOpen((current) => (current === test.name ? null : test.name))}
              theme={theme}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TestRow({ test, open, onToggle, theme }: { test: TestCase; open: boolean; onToggle: () => void; theme: IdeTheme }) {
  const palette = idePalette(theme);
  const failed = test.status === "fail" || test.status === "error";
  const Icon = failed ? CircleX : test.status === "skip" ? CircleMinus : CircleCheck;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={!test.detail}
        className={clsx("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left", test.detail && palette.hover)}
      >
        <Icon size={12} className={failed ? "text-red-400" : test.status === "skip" ? palette.textMuted : "text-emerald-500"} />
        <span className="font-mono">{test.name}</span>
        {test.status === "error" && <span className="text-red-400">error</span>}
        {test.status === "skip" && <span className={palette.textMuted}>skipped</span>}
      </button>
      {open && test.detail && (
        <pre className={clsx("mt-0.5 mb-1.5 ml-6 overflow-x-auto rounded-md border px-2 py-1.5 font-mono whitespace-pre-wrap", palette.border)}>
          {test.detail}
        </pre>
      )}
    </li>
  );
}
