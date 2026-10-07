/**
 * Checks test-results.ts against real test output, in Node:
 *
 *   node src/lib/ide/test-results.check.ts
 *
 * The Python cases run the real `python -m unittest` on a small project
 * written to a temporary directory (skipped, and said so, when Python isn't
 * installed); the JavaScript case runs the workspace's own runner
 * (js-workspace.ts). What is parsed is what those really printed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { runNodeTests } from "./js-workspace.ts";
import { lineChange } from "./line-change.ts";
import { isTestCommand, parseTestRun, testCommandFor } from "./test-results.ts";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${label}${pass || !detail ? "" : `\n        ${detail.replace(/\n/g, "\n        ")}`}`);
}

// ── Python ───────────────────────────────────────────────────────────────
const python = ["python3", "python"].find((name) => {
  try {
    execFileSync(name, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

if (!python) {
  console.log("skip  Python isn't installed here, so the unittest cases were not run");
} else {
  const dir = mkdtempSync(join(tmpdir(), "mf-test-results-"));
  mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "discount.py"), "def apply(total, percent):\n    return total - total * percent\n");
  writeFileSync(join(dir, "tests", "__init__.py"), "");
  writeFileSync(
    join(dir, "tests", "test_discount.py"),
    `import unittest
from discount import apply


class DiscountTest(unittest.TestCase):
    def test_ten_percent_off(self):
        self.assertEqual(apply(200, 10), 180)

    def test_no_discount(self):
        self.assertEqual(apply(200, 0), 200)

    @unittest.skip("later")
    def test_later(self):
        pass

    def test_boom(self):
        raise ValueError("boom")
`,
  );
  const run = (args: string[]) => {
    const r = spawnSync(python, args, { cwd: dir, encoding: "utf8" });
    return { output: `${r.stdout}${r.stderr}`.replace(/\r\n/g, "\n"), code: r.status ?? 1 };
  };

  const verbose = run(["-m", "unittest", "-v"]);
  let parsed = parseTestRun("python -m unittest -v", verbose.output, verbose.code);
  check("unittest -v: counts", parsed.parsed && parsed.passed === 1 && parsed.failed === 2 && parsed.skipped === 1, JSON.stringify(parsed, null, 1));
  const by = (name: string) => parsed.tests.find((t) => t.name === name);
  check("unittest -v: every test is named with its result", parsed.tests.length === 4 && by("DiscountTest.test_no_discount")?.status === "pass" && by("DiscountTest.test_later")?.status === "skip");
  check("unittest -v: a failure carries its assertion", by("DiscountTest.test_ten_percent_off")?.status === "fail" && !!by("DiscountTest.test_ten_percent_off")?.detail?.includes("AssertionError: -1800 != 180"), by("DiscountTest.test_ten_percent_off")?.detail);
  check("unittest -v: an error is told apart from a failure", by("DiscountTest.test_boom")?.status === "error" && !!by("DiscountTest.test_boom")?.detail?.includes("ValueError: boom"));

  const plain = run(["-m", "unittest"]);
  parsed = parseTestRun("python -m unittest", plain.output, plain.code);
  check("unittest without -v: counts are still right", parsed.passed === 1 && parsed.failed === 2 && parsed.skipped === 1);
  check("unittest without -v: the failing tests are still named", parsed.tests.length === 2 && parsed.tests.every((t) => t.status !== "pass" && !!t.detail));

  writeFileSync(join(dir, "discount.py"), "def apply(total, percent):\n    return total - total * percent / 100\n");
  writeFileSync(join(dir, "tests", "test_discount.py"), "import unittest\nfrom discount import apply\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(apply(200, 10), 180)\n");
  const green = run(["-m", "unittest", "-v"]);
  parsed = parseTestRun("python -m unittest -v", green.output, green.code);
  check("unittest: an all-green run", parsed.parsed && parsed.exitCode === 0 && parsed.passed === 1 && parsed.failed === 0 && parsed.tests[0]?.status === "pass");
  rmSync(dir, { recursive: true, force: true });
}

// ── Node's runner, as the workspace runs it ──────────────────────────────
const transpile = (code: string, fileName: string) =>
  ts.transpileModule(code, { fileName, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const node = await runNodeTests(
  {
    "/math.js": "export const add = (a, b) => a - b;\n",
    "/math.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { add } from "./math.js";
test("adds", () => assert.equal(add(2, 2), 4));
test("is commutative", () => assert.equal(add(0, 0), 0));
test.skip("later", () => {});
`,
  },
  "/",
  [],
  transpile,
);
const nodeRun = parseTestRun("node --test", node.output, node.code);
check("node --test: counts", nodeRun.parsed && nodeRun.passed === 1 && nodeRun.failed === 1 && nodeRun.skipped === 1, node.output);
check("node --test: the failure carries what was expected", nodeRun.tests.find((t) => t.name === "adds")?.detail?.includes("0 !== 4") === true, JSON.stringify(nodeRun.tests));

// ── Everything else ──────────────────────────────────────────────────────
const junk = parseTestRun("python -m unittest", "Traceback (most recent call last):\nModuleNotFoundError: No module named 'discount'\n", 1);
check("output that isn't a test report is not turned into results", !junk.parsed && junk.passed === 0 && junk.tests.length === 0 && junk.tail.includes("ModuleNotFoundError"));

check("test commands are recognised", ["python -m unittest", "python3 -m unittest -v tests", "node --test", "npm test", "npm run test", "cd app && node --test src"].every(isTestCommand));
check("other commands are not", !["python main.py", "node index.js", "npm install", "ls"].some(isTestCommand));
check("the project's test command is found from its files", testCommandFor(["/a.py", "/tests/test_a.py"]) === "python -m unittest -v" && testCommandFor(["/src/a.ts", "/src/a.test.ts"]) === "node --test" && testCommandFor(["/README.md", "/node_modules/x/test/y.js"]) === null);

check("lineChange: a changed line is one out, one in", JSON.stringify(lineChange("a\nb\nc", "a\nB\nc")) === '{"added":1,"removed":1}');
check("lineChange: added and removed lines", JSON.stringify(lineChange("a\nb", "a\nb\nc\nd")) === '{"added":2,"removed":0}' && JSON.stringify(lineChange("a\nb\nc", "a")) === '{"added":0,"removed":2}');
check("lineChange: no change, and a moved block, are nothing", lineChange("a\nb", "a\nb").added === 0 && JSON.stringify(lineChange("a\nb\nc", "c\na\nb")) === '{"added":0,"removed":0}');

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
