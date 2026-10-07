/**
 * Reading a test run's output into results: which tests there were, which
 * passed, and what the ones that failed said.
 *
 * The workspace runs tests for real (Python's unittest in Pyodide, Node's
 * test runner in js-workspace.ts); what they print is the truth, and this
 * only reads it. It never decides a result for itself: a run it can't parse
 * is reported as a run with its exit code and raw output, not as passes.
 *
 * A plain module store with no React and no DOM imports, like output.ts and
 * terminal-log.ts — it is fed from the terminal, outside React's render
 * cycle, and checked in Node (test-results.check.ts).
 */

export type TestStatus = "pass" | "fail" | "error" | "skip";

export interface TestCase {
  name: string;
  status: TestStatus;
  /** What the runner printed for a failure: the assertion and where. */
  detail?: string;
}

export interface TestRun {
  command: string;
  /** ms since the epoch. */
  at: number;
  exitCode: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Individual tests, when the output named them. May be shorter than the counts for a run without -v. */
  tests: TestCase[];
  /** False when the output wasn't recognisably a test runner's: only the exit code is known. */
  parsed: boolean;
  /** The end of the raw output, for a run that couldn't be read or that failed before any test ran. */
  tail: string;
}

/** Whether a command line is a test run this workspace knows how to read. */
export function isTestCommand(line: string): boolean {
  const first = line.trim().split(/\s*(?:&&|\|\||;|\|)\s*/).pop() ?? "";
  return (
    /^(python3?|py)\s+(.*\s)?-m\s+(unittest|pytest)\b/.test(first) ||
    /^node\s+(.*\s)?--test\b/.test(first) ||
    /^npm\s+(test|t|run\s+test)\b/.test(first)
  );
}

/** The test command for a project, from what it contains — what the panel's Run button runs. */
export function testCommandFor(paths: string[]): string | null {
  const real = paths.filter((p) => !/(^|\/)node_modules\//.test(p));
  if (real.some((p) => /(^|\/)(test_[^/]*|[^/]*_test)\.py$/.test(p))) return "python -m unittest -v";
  if (real.some((p) => /\.(test|spec)\.[cm]?[jt]s$/.test(p) || /(^|\/)tests?\/[^/]+\.[cm]?[jt]s$/.test(p))) return "node --test";
  return null;
}

const tailOf = (output: string, max = 4000) => (output.length > max ? `…${output.slice(-max)}` : output);

// ── Python's unittest ────────────────────────────────────────────────────

const PY_VERBOSE = /^(\w+) \(([\w.]+)\)(?:\s*\n?.*?)? \.\.\. (ok|FAIL|ERROR|skipped.*|expected failure|unexpected success)$/;
const PY_BLOCK = /^(FAIL|ERROR): (\w+) \(([\w.]+)\)\s*$/;

function parseUnittest(output: string): Pick<TestRun, "passed" | "failed" | "skipped" | "tests"> | null {
  const ran = output.match(/^Ran (\d+) tests? in /m);
  if (!ran) return null;
  const total = Number(ran[1]);
  const lines = output.split("\n");

  // Failure blocks: a ====== rule, "FAIL: name (where)", a ------ rule, then
  // the traceback up to the next rule.
  const details = new Map<string, { status: TestStatus; detail: string }>();
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(PY_BLOCK);
    if (!head || !/^=+$/.test(lines[i - 1] ?? "")) continue;
    const body: string[] = [];
    for (let j = i + 2; j < lines.length && !/^[=-]{20,}$/.test(lines[j]); j++) body.push(lines[j]);
    details.set(`${head[2]} (${head[3]})`, { status: head[1] === "FAIL" ? "fail" : "error", detail: body.join("\n").trim() });
  }

  const tests: TestCase[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(PY_VERBOSE);
    if (!m) continue;
    const key = `${m[1]} (${m[2]})`;
    seen.add(key);
    const status: TestStatus = m[3] === "ok" || m[3] === "expected failure" ? "pass" : m[3].startsWith("skipped") ? "skip" : m[3] === "ERROR" ? "error" : "fail";
    tests.push({ name: `${m[2].split(".").slice(-2, -1)[0] ?? m[2]}.${m[1]}`, status, detail: details.get(key)?.detail });
  }
  // Without -v the passing tests are only dots, but the failing ones still
  // get their blocks.
  for (const [key, d] of details) {
    if (seen.has(key)) continue;
    const m = key.match(/^(\w+) \(([\w.]+)\)$/);
    tests.push({ name: m ? `${m[2].split(".").slice(-2, -1)[0] ?? m[2]}.${m[1]}` : key, status: d.status, detail: d.detail });
  }

  const summary = output.match(/^FAILED \(([^)]*)\)/m)?.[1] ?? "";
  const count = (label: string) => Number(summary.match(new RegExp(`${label}=(\\d+)`))?.[1] ?? 0);
  const skipped = Number(output.match(/^OK \(skipped=(\d+)\)/m)?.[1] ?? count("skipped"));
  const failed = count("failures") + count("errors") + count("unexpected successes");
  return { passed: Math.max(0, total - failed - skipped), failed, skipped, tests };
}

// ── Node's test runner ───────────────────────────────────────────────────

function parseNodeTest(output: string): Pick<TestRun, "passed" | "failed" | "skipped" | "tests"> | null {
  const count = (label: string) => output.match(new RegExp(`^[ℹ#] ${label} (\\d+)`, "m"))?.[1];
  const pass = count("pass");
  const fail = count("fail");
  if (pass === undefined || fail === undefined) return null;

  const tests: TestCase[] = [];
  const lines = output.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([✔✖﹣]) (.*?)(?: \([\d.]+ms\))?(?: # (SKIP|TODO))?$/);
    if (!m) continue;
    if (m[1] === "✔") tests.push({ name: m[2], status: "pass" });
    else if (m[1] === "﹣") tests.push({ name: m[2], status: "skip" });
    else {
      const body: string[] = [];
      // A failure's lines are indented under it, blank ones included.
      for (let j = i + 1; j < lines.length && /^ {2}/.test(lines[j]); j++) body.push(lines[j].replace(/^ {2}/, ""));
      tests.push({ name: m[2], status: "fail", detail: body.join("\n").trim() });
    }
  }
  return { passed: Number(pass), failed: Number(fail), skipped: Number(count("skipped") ?? 0) + Number(count("todo") ?? 0), tests };
}

/** Reads a finished test command's output. Always returns a run; `parsed` says whether the counts mean anything. */
export function parseTestRun(command: string, output: string, exitCode: number, at = Date.now()): TestRun {
  const read = parseUnittest(output) ?? parseNodeTest(output);
  if (!read) return { command, at, exitCode, passed: 0, failed: 0, skipped: 0, tests: [], parsed: false, tail: tailOf(output) };
  return { command, at, exitCode, ...read, parsed: true, tail: tailOf(output) };
}

// ── The latest run ───────────────────────────────────────────────────────

type Listener = () => void;
let latest: TestRun | null = null;
const listeners = new Set<Listener>();

export const testResults = {
  record(run: TestRun): void {
    latest = run;
    for (const l of listeners) l();
  },
  getSnapshot: (): TestRun | null => latest,
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
