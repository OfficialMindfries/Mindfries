/**
 * Checks the practice task with the real Python, in Node:
 *
 *   node src/lib/ide/practice-task.check.ts
 *
 * The task is only worth practising on if it behaves like a real one: its
 * tests must fail on the code as given, and pass once the bug is fixed.
 * Skipped, and said so, when Python isn't installed.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PRACTICE_BRIEF, PRACTICE_FILES } from "./practice-task.ts";
import { parseTestRun } from "./test-results.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const python = ["python", "python3"].find((p) => spawnSync(p, ["--version"]).status === 0);
check("the brief has no code fence, which the brief panel doesn't draw", !PRACTICE_BRIEF.includes("```"));

if (!python) {
  console.log("skip  Python isn't installed here, so the task itself wasn't run");
} else {
  const run = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "mf-practice-"));
    try {
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
      }
      const r = spawnSync(python, ["-m", "unittest", "discover", "-s", "tests", "-v"], { cwd: dir, encoding: "utf8" });
      // Windows Python writes CRLF; the workspace's own Python never does.
      return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(/\r\n/g, "\n") };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  const given = run(PRACTICE_FILES);
  const parsed = parseTestRun("python -m unittest discover -s tests -v", given.out, given.code ?? 1);
  check("as given, the tests fail", given.code !== 0, `exit ${given.code}`);
  check("the Tests panel can read that run", parsed.parsed && parsed.tests.length === 3, `${parsed.tests.length} tests, ${parsed.failed} failed`);
  check("one test already passes, so the failure is the bug and not a broken project", parsed.passed >= 1 && parsed.failed >= 1);

  const fixed = run({ ...PRACTICE_FILES, "/pricing/discount.py": PRACTICE_FILES["/pricing/discount.py"].replace("total * percent\n", "total * percent / 100\n") });
  check("with the bug fixed, they all pass", fixed.code === 0, fixed.out.trim().split("\n").at(-1));
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
