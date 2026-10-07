/**
 * Runs js-workspace.ts for real, in Node, with the real TypeScript compiler:
 *
 *   node src/lib/ide/js-workspace.check.ts [project-dir]
 *
 * With no argument it uses small built-in projects — a JavaScript one in ES
 * modules, a TypeScript one, a CommonJS one — each with a planted bug, and
 * checks that `node --test` fails on the bug and passes once it's fixed.
 * Given a directory, it loads every file under it as the workspace and runs
 * `node --test` there, which is how a generated JavaScript or TypeScript
 * task is checked for actually working in the candidate's workspace.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { isTestFile, needsProject, runNodeFile, runNodeTests, type Transpile } from "./js-workspace.ts";

const transpile: Transpile = (code, fileName) =>
  ts.transpileModule(code, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${label}${pass || !detail ? "" : `\n        ${detail.replace(/\n/g, "\n        ")}`}`);
}

function readProject(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === "_BRIEF.md") continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[`/${relative(dir, full).replaceAll("\\", "/")}`] = readFileSync(full, "utf8");
    }
  };
  walk(dir);
  return files;
}

const projectDir = process.argv[2];
if (projectDir) {
  const files = readProject(projectDir);
  console.log(`Loaded ${Object.keys(files).length} files from ${projectDir}`);
  const run = await runNodeTests(files, "/", [], transpile);
  console.log(run.output);
  console.log(`node --test exited ${run.code}`);
  process.exit(0);
}

// ── A JavaScript project in ES modules ─────────────────────────────────────
const esm = {
  "/package.json": '{ "type": "module", "scripts": { "test": "node --test" } }',
  "/src/cart.js": `import { roundMoney } from "./money.js";

export function total(items, discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return roundMoney(subtotal - subtotal * discountPercent);
}
`,
  "/src/money.js": `export const roundMoney = (amount) => Math.round(amount * 100) / 100;\n`,
  "/test/cart.test.js": `import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/cart.js";

describe("cart total", () => {
  let items;
  beforeEach(() => {
    items = [{ price: 20, quantity: 2 }, { price: 10, quantity: 1 }];
  });

  test("adds up the lines", () => {
    assert.equal(total(items), 50);
  });

  test("takes a percentage off", () => {
    assert.equal(total(items, 10), 45);
  });

  test("an empty cart is free", async () => {
    assert.deepEqual({ total: total([]) }, { total: 0 });
  });
});
`,
};

let run = await runNodeTests(esm, "/", [], transpile);
check("ES modules: the test file imports the project's own files", run.output.includes("✔ cart total > adds up the lines"), run.output);
check("ES modules: the planted bug fails its test and no other", run.code === 1 && run.output.includes("✖ cart total > takes a percentage off") && /ℹ pass 2\nℹ fail 1/.test(run.output), run.output);
check("ES modules: the failure says what was expected", run.output.includes("AssertionError [ERR_ASSERTION]") && run.output.includes("-450 !== 45"), run.output);

const fixed = { ...esm, "/src/cart.js": esm["/src/cart.js"].replace("subtotal * discountPercent", "(subtotal * discountPercent) / 100") };
run = await runNodeTests(fixed, "/", [], transpile);
check("ES modules: with the bug fixed every test passes", run.code === 0 && /ℹ pass 3\nℹ fail 0/.test(run.output), run.output);

// ── A TypeScript project ───────────────────────────────────────────────────
const tsProject = {
  "/src/limiter.ts": `export interface Hit { key: string; at: number }

export class Limiter {
  private hits: Hit[] = [];
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now: number): boolean {
    const recent = this.hits.filter((h) => h.key === key && h.at > now - this.windowMs);
    if (recent.length > this.limit) return false;
    this.hits.push({ key, at: now });
    return true;
  }
}
`,
  "/src/limiter.test.ts": `import test from "node:test";
import assert from "node:assert";
import { Limiter } from "./limiter.js";

test("allows up to the limit", () => {
  const limiter: Limiter = new Limiter(2, 1000);
  assert.strictEqual(limiter.allow("a", 0), true);
  assert.strictEqual(limiter.allow("a", 1), true);
  assert.strictEqual(limiter.allow("a", 2), false);
});

test("forgets hits outside the window", () => {
  const limiter = new Limiter(1, 1000);
  limiter.allow("a", 0);
  assert.ok(limiter.allow("a", 5000));
});
`,
};
run = await runNodeTests(tsProject, "/", [], transpile);
check("TypeScript: types, classes and a './x.js' import of x.ts all load", run.output.includes("✔ forgets hits outside the window"), run.output);
check("TypeScript: the off-by-one is caught", run.code === 1 && run.output.includes("✖ allows up to the limit") && run.output.includes("true !== false"), run.output);
run = await runNodeTests({ ...tsProject, "/src/limiter.ts": tsProject["/src/limiter.ts"].replace("recent.length > this.limit", "recent.length >= this.limit") }, "/", [], transpile);
check("TypeScript: fixed, it passes", run.code === 0, run.output);

// ── CommonJS, hooks, async, throws, and running one file ───────────────────
const cjs = {
  "/lib/parse.js": `function parseAge(text) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) throw new RangeError("not an age: " + text);
  return n;
}
module.exports = { parseAge };
`,
  "/tests/parse_test.js": `const { test, before, after } = require("node:test");
const assert = require("assert");
const { parseAge } = require("../lib/parse");

let ready = false;
before(() => { ready = true; });
after(() => { console.log("cleaned up"); });

test("parses a number", () => { assert.ok(ready); assert.strictEqual(parseAge("42"), 42); });
test("rejects nonsense", () => { assert.throws(() => parseAge("abc"), RangeError); assert.throws(() => parseAge("-1"), /not an age/); });
test("waits for async work", async () => { const v = await Promise.resolve(parseAge("7")); assert.deepStrictEqual([v], [7]); });
test("rejects are checked", async () => { await assert.rejects(Promise.reject(new TypeError("nope")), { name: "TypeError", message: "nope" }); });
test.skip("not written yet", () => { throw new Error("should not run"); });
`,
  "/main.js": `const { parseAge } = require("./lib/parse");\nconsole.log("age:", parseAge("30"), { ok: true }, [1, 2]);\n`,
  "/uses-fs.js": `const fs = require("fs");\nconsole.log(fs.readFileSync("x"));\n`,
};
run = await runNodeTests(cjs, "/", [], transpile);
check("CommonJS: require, hooks, async tests, throws and rejects", run.code === 0 && /ℹ pass 4\nℹ fail 0\nℹ skipped 1/.test(run.output) && run.output.includes("cleaned up"), run.output);
check("a named test file can be run on its own", (await runNodeTests(cjs, "/tests", ["parse_test.js"], transpile)).code === 0);
check("a directory with no tests says so", (await runNodeTests(cjs, "/lib", [], transpile)).code === 1);

run = await runNodeFile(cjs, "/main.js", transpile);
check("node main.js runs a multi-file script and prints like a console", run.code === 0 && run.output === "age: 30 { ok: true } [ 1, 2 ]\n", JSON.stringify(run.output));
run = await runNodeFile(cjs, "/uses-fs.js", transpile);
check("a Node built-in that isn't here fails by saying so", run.code === 1 && run.output.includes("there is no Node process here"), run.output);
run = await runNodeFile({ "/a.js": `import x from "./missing.js";` }, "/a.js", transpile);
check("a missing file is a clear error", run.code === 1 && run.output.includes("Cannot find module './missing.js'"), run.output);

check("needsProject spots a relative import, a require and a node: import", needsProject(`import a from "./a.js"`) && needsProject(`const a = require("../a")`) && needsProject(`import test from "node:test"`));
check("needsProject leaves a standalone script alone", !needsProject(`console.log(1 + 1)`) && !needsProject(`import _ from "lodash"`));
check("test files are found the way node --test finds them", ["/a.test.js", "/src/b.test.ts", "/test/c.js", "/tests/d_test.js", "/e.spec.js"].every(isTestFile) && !["/src/cart.js", "/node_modules/x/test/y.js", "/README.md"].some(isTestFile));

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
