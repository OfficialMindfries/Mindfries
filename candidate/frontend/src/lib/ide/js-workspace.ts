/**
 * Running a JavaScript or TypeScript *project* in the workspace: files that
 * import each other, and tests written against Node's own test runner.
 *
 * code-runner.ts runs one file at a time, which is enough for a script and
 * not for an assessment: a task with `src/cart.js` and `test/cart.test.js`
 * needs the second to import the first, and needs `node --test` to mean
 * something. This is that — a module loader over the workspace's virtual
 * filesystem, and an implementation of the parts of `node:test` and
 * `node:assert` that a small project's tests use.
 *
 * It is real execution: every file is transpiled by the actual TypeScript
 * compiler (which is also how ES module syntax becomes loadable) and run;
 * assertions really compare, tests really pass or fail. What it is not is
 * Node. There is no process, no filesystem and no network, so the other
 * built-ins (`fs`, `http`, `child_process`, …) aren't there, and importing
 * one fails with a message saying so rather than with a silent stub.
 *
 * Deliberately free of DOM and React imports, and of imports altogether, so
 * it can be driven in Node (js-workspace.check.ts) — the same reason the
 * shell engine is.
 */

/** The one thing borrowed from outside: the TypeScript compiler's single-file transform. */
export type Transpile = (code: string, fileName: string) => string;

export interface ProjectRun {
  /** Everything printed, in order, ending with a newline when non-empty. */
  output: string;
  /** 0 when everything passed (or the script ran to the end), 1 otherwise. */
  code: number;
}

type Files = Record<string, string>;

const SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"];
const RESOLVE_SUFFIXES = ["", ...SOURCE_EXTENSIONS, ".json", ...SOURCE_EXTENSIONS.map((e) => `/index${e}`)];

// ── Paths ────────────────────────────────────────────────────────────────

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

const dirname = (path: string) => normalize(path.slice(0, path.lastIndexOf("/")) || "/");

/** The workspace's files under absolute, normalized paths. */
function rooted(files: Files): Files {
  const out: Files = {};
  for (const [path, content] of Object.entries(files)) out[normalize(path)] = content;
  return out;
}

// ── Printing values the way a console does ───────────────────────────────

function inspect(value: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (typeof value === "string") return depth === 0 ? value : JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return `[Function: ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();
  if (value === null || typeof value !== "object") return String(value);
  if (value instanceof Error) return value.stack && depth === 0 ? `${value.name}: ${value.message}` : `[${value.name}: ${value.message}]`;
  if (seen.has(value)) return "[Circular]";
  if (depth > 3) return Array.isArray(value) ? "[Array]" : "[Object]";
  seen.add(value);
  let text: string;
  if (Array.isArray(value)) {
    text = `[ ${value.map((v) => inspect(v, depth + 1, seen)).join(", ")} ]`;
    if (value.length === 0) text = "[]";
  } else if (value instanceof Map) {
    text = `Map(${value.size}) { ${[...value].map(([k, v]) => `${inspect(k, depth + 1, seen)} => ${inspect(v, depth + 1, seen)}`).join(", ")} }`;
  } else if (value instanceof Set) {
    text = `Set(${value.size}) { ${[...value].map((v) => inspect(v, depth + 1, seen)).join(", ")} }`;
  } else if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  } else {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${inspect(v, depth + 1, seen)}`);
    const name = (value as object).constructor?.name;
    const prefix = name && name !== "Object" ? `${name} ` : "";
    text = entries.length === 0 ? `${prefix}{}` : `${prefix}{ ${entries.join(", ")} }`;
  }
  seen.delete(value);
  return text;
}

const show = (value: unknown) => inspect(value, 1);

// ── node:assert ──────────────────────────────────────────────────────────

// Plain fields, here and in Loader, rather than constructor parameter
// properties: the check script runs this file through Node's own type
// stripping, which removes types and nothing else.
class AssertionError extends Error {
  code = "ERR_ASSERTION";
  actual: unknown;
  expected: unknown;
  operator: string | undefined;
  constructor(message: string, actual?: unknown, expected?: unknown, operator?: string) {
    super(message);
    this.name = "AssertionError";
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
  }
}

function deepEqual(a: unknown, b: unknown, strict: boolean, seen = new Map<unknown, unknown>()): boolean {
  if (strict ? Object.is(a, b) : a == b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return !strict && typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
  }
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof RegExp || b instanceof RegExp) return String(a) === String(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), strict, seen)) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    outer: for (const v of a) {
      if (b.has(v)) continue;
      for (const w of b) if (deepEqual(v, w, strict, seen)) continue outer;
      return false;
    }
    return true;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], strict, seen)) return false;
  }
  return true;
}

function matchesExpectation(error: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  if (typeof expected === "function") {
    if (expected.prototype !== undefined && error instanceof (expected as new () => unknown)) return true;
    if (Error.isPrototypeOf(expected)) return false;
    return (expected as (e: unknown) => unknown)(error) === true;
  }
  if (typeof expected === "object" && expected !== null) {
    return Object.entries(expected).every(([k, v]) => {
      const actual = (error as Record<string, unknown> | null)?.[k];
      return v instanceof RegExp && typeof actual === "string" ? v.test(actual) : deepEqual(actual, v, true);
    });
  }
  return false;
}

function buildAssert(strictByDefault: boolean) {
  const raise = (message: unknown, fallback: string, actual?: unknown, expected?: unknown, operator?: string): never => {
    if (message instanceof Error) throw message;
    throw new AssertionError(typeof message === "string" ? message : fallback, actual, expected, operator);
  };
  const compare = (strict: boolean, deep: boolean, negate: boolean, operator: string) => (actual: unknown, expected: unknown, message?: unknown) => {
    const same = deep ? deepEqual(actual, expected, strict) : strict ? Object.is(actual, expected) : actual == expected;
    if (same === negate) {
      const lead = negate
        ? `Expected "actual" to be ${deep ? "not deep-equal" : "different from"} "expected":`
        : `Expected values to be ${strict ? "strictly " : "loosely "}${deep ? "deep-" : ""}equal:`;
      raise(message, `${lead}\n\n${show(actual)} ${negate ? "===" : "!=="} ${show(expected)}\n`, actual, expected, operator);
    }
  };

  const ok = (value: unknown, message?: unknown) => {
    if (!value) raise(message, `The expression evaluated to a falsy value:\n\n  assert.ok(${show(value)})\n`, value, true, "==");
  };
  const assert = ok as typeof ok & Record<string, unknown>;
  const strict = {
    equal: compare(true, false, false, "strictEqual"),
    notEqual: compare(true, false, true, "notStrictEqual"),
    deepEqual: compare(true, true, false, "deepStrictEqual"),
    notDeepEqual: compare(true, true, true, "notDeepStrictEqual"),
  };
  const loose = {
    equal: compare(false, false, false, "=="),
    notEqual: compare(false, false, true, "!="),
    deepEqual: compare(false, true, false, "deepEqual"),
    notDeepEqual: compare(false, true, true, "notDeepEqual"),
  };
  Object.assign(assert, strictByDefault ? strict : loose, {
    ok,
    strictEqual: strict.equal,
    notStrictEqual: strict.notEqual,
    deepStrictEqual: strict.deepEqual,
    notDeepStrictEqual: strict.notDeepEqual,
    AssertionError,
    fail: (message?: unknown) => raise(message, "Failed", undefined, undefined, "fail"),
    match: (value: string, pattern: RegExp, message?: unknown) => {
      if (!pattern.test(value)) raise(message, `The input did not match the regular expression ${pattern}. Input:\n\n${show(value)}\n`, value, pattern, "match");
    },
    doesNotMatch: (value: string, pattern: RegExp, message?: unknown) => {
      if (pattern.test(value)) raise(message, `The input was expected to not match the regular expression ${pattern}. Input:\n\n${show(value)}\n`, value, pattern, "doesNotMatch");
    },
    throws: (fn: () => unknown, expected?: unknown, message?: unknown) => {
      if (typeof expected === "string") [expected, message] = [undefined, expected];
      let threw = false;
      let error: unknown;
      try {
        fn();
      } catch (e) {
        threw = true;
        error = e;
      }
      if (!threw) raise(message, "Missing expected exception.", undefined, expected, "throws");
      if (!matchesExpectation(error, expected)) throw error;
    },
    doesNotThrow: (fn: () => unknown, message?: unknown) => {
      try {
        fn();
      } catch (e) {
        raise(message, `Got unwanted exception.\nActual message: "${e instanceof Error ? e.message : String(e)}"`, e, undefined, "doesNotThrow");
      }
    },
    rejects: async (promiseOrFn: Promise<unknown> | (() => Promise<unknown>), expected?: unknown, message?: unknown) => {
      if (typeof expected === "string") [expected, message] = [undefined, expected];
      let threw = false;
      let error: unknown;
      try {
        await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
      } catch (e) {
        threw = true;
        error = e;
      }
      if (!threw) raise(message, "Missing expected rejection.", undefined, expected, "rejects");
      if (!matchesExpectation(error, expected)) throw error;
    },
    doesNotReject: async (promiseOrFn: Promise<unknown> | (() => Promise<unknown>), message?: unknown) => {
      try {
        await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
      } catch (e) {
        raise(message, `Got unwanted rejection.\nActual message: "${e instanceof Error ? e.message : String(e)}"`, e, undefined, "doesNotReject");
      }
    },
    ifError: (value: unknown) => {
      if (value !== null && value !== undefined) throw value instanceof Error ? value : new AssertionError(`ifError got unwanted exception: ${show(value)}`, value, null, "ifError");
    },
  });
  return assert;
}

// ── node:test ────────────────────────────────────────────────────────────

type TestFn = (t: TestContext) => unknown;
interface TestContext {
  name: string;
  test: (name: string, fn: TestFn) => Promise<void>;
  skip: (reason?: string) => void;
  todo: (reason?: string) => void;
  diagnostic: (message: string) => void;
}
interface Collected {
  name: string;
  fn?: TestFn;
  skip: boolean;
  todo: boolean;
  hooks: Suite[];
}
interface Suite {
  name: string;
  before: (() => unknown)[];
  after: (() => unknown)[];
  beforeEach: (() => unknown)[];
  afterEach: (() => unknown)[];
  /** Whether this suite's `before` hooks have run, and how many of its tests are still to run. */
  started: boolean;
  remaining: number;
}

const newSuite = (name: string): Suite => ({ name, before: [], after: [], beforeEach: [], afterEach: [], started: false, remaining: 0 });

function buildTestModule(collected: Collected[]) {
  const stack: Suite[] = [newSuite("")];
  type Options = { skip?: boolean | string; todo?: boolean | string };
  const split = (a?: Options | TestFn, b?: TestFn): [Options, TestFn | undefined] => (typeof a === "function" ? [{}, a] : [a ?? {}, b]);

  const register = (flags: Options) => (name: string, a?: Options | TestFn, b?: TestFn) => {
    const [options, fn] = split(a, b);
    const merged = { ...options, ...flags };
    const hooks = [...stack];
    for (const s of hooks) s.remaining++;
    collected.push({
      name: [...stack.slice(1).map((s) => s.name), name].join(" > "),
      fn,
      skip: !!merged.skip || !fn,
      todo: !!merged.todo,
      hooks,
    });
  };
  const suite = (flags: Options) => (name: string, a?: Options | (() => void), b?: () => void) => {
    const [options, body] = split(a as Options | TestFn, b as TestFn | undefined);
    if (options.skip || flags.skip || !body) return;
    stack.push(newSuite(name));
    try {
      (body as unknown as () => void)();
    } finally {
      stack.pop();
    }
  };

  const test = Object.assign(register({}), { skip: register({ skip: true }), todo: register({ todo: true }), only: register({}) });
  const describe = Object.assign(suite({}), { skip: suite({ skip: true }), todo: suite({ skip: true }), only: suite({}) });
  const hook = (kind: "before" | "after" | "beforeEach" | "afterEach") => (fn: () => unknown) => {
    stack[stack.length - 1][kind].push(fn);
  };
  const api = { test, it: test, describe, suite: describe, before: hook("before"), after: hook("after"), beforeEach: hook("beforeEach"), afterEach: hook("afterEach") };
  return Object.assign(test, api, { default: test });
}

// ── Loading modules ──────────────────────────────────────────────────────

const UNAVAILABLE =
  "isn't available in the browser workspace: there is no Node process here. Project files can import each other, and node:test and node:assert are provided.";

class Loader {
  private cache = new Map<string, { exports: unknown }>();
  readonly tests: Collected[] = [];
  private testModule = buildTestModule(this.tests);
  private assertLoose = buildAssert(false);
  private assertStrict = buildAssert(true);

  private readonly files: Files;
  private readonly transpile: Transpile;
  private readonly console: Record<string, (...args: unknown[]) => void>;

  constructor(files: Files, transpile: Transpile, console: Record<string, (...args: unknown[]) => void>) {
    this.files = files;
    this.transpile = transpile;
    this.console = console;
    (this.assertLoose as Record<string, unknown>).strict = this.assertStrict;
    (this.assertStrict as Record<string, unknown>).strict = this.assertStrict;
  }

  private builtin(specifier: string): unknown | undefined {
    switch (specifier.replace(/^node:/, "")) {
      case "test":
        return this.testModule;
      case "assert":
        return this.assertLoose;
      case "assert/strict":
        return this.assertStrict;
    }
    return undefined;
  }

  private resolveFile(base: string): string | undefined {
    for (const suffix of RESOLVE_SUFFIXES) {
      if (this.files[base + suffix] !== undefined) return base + suffix;
    }
    // TypeScript sources import "./cart.js" and mean cart.ts.
    const swapped = base.replace(/\.(m|c)?js$/, ".$1ts");
    return swapped !== base && this.files[swapped] !== undefined ? swapped : undefined;
  }

  private resolve(specifier: string, from: string): string {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      const found = this.resolveFile(specifier.startsWith("/") ? normalize(specifier) : normalize(`${dirname(from)}/${specifier}`));
      if (found) return found;
      throw new Error(`Cannot find module '${specifier}' imported from ${from}`);
    }
    // A package installed into the workspace's node_modules.
    const [scopeOrName, maybeName, ...rest] = specifier.split("/");
    const name = scopeOrName.startsWith("@") ? `${scopeOrName}/${maybeName}` : scopeOrName;
    const subpath = (scopeOrName.startsWith("@") ? rest : [maybeName, ...rest]).filter(Boolean).join("/");
    const root = `/node_modules/${name}`;
    const manifest = this.files[`${root}/package.json`];
    if (manifest !== undefined) {
      let main = "index.js";
      try {
        main = (JSON.parse(manifest) as { main?: string }).main || main;
      } catch {
        // an unreadable manifest falls back to index.js
      }
      const found = this.resolveFile(normalize(`${root}/${subpath || main}`));
      if (found) return found;
    }
    if (/^(node:)?(fs|path|os|http|https|net|child_process|crypto|url|util|events|stream|buffer|worker_threads|readline|zlib|dns|tls|cluster|vm|module|timers|process)(\/|$)/.test(specifier)) {
      throw new Error(`Cannot find module '${specifier}' — Node's '${specifier.replace(/^node:/, "")}' ${UNAVAILABLE}`);
    }
    throw new Error(`Cannot find package '${specifier}' imported from ${from}. Install it with npm install ${name}, or check the name.`);
  }

  require(specifier: string, from: string): unknown {
    const builtin = this.builtin(specifier);
    if (builtin !== undefined) return builtin;
    return this.load(this.resolve(specifier, from));
  }

  load(path: string): unknown {
    const cached = this.cache.get(path);
    if (cached) return cached.exports;
    const source = this.files[path];
    if (source === undefined) throw new Error(`Cannot find module '${path}'`);
    const mod = { exports: {} as unknown };
    this.cache.set(path, mod); // before running it, so a cycle gets the partial exports, as in Node
    if (path.endsWith(".json")) {
      mod.exports = JSON.parse(source);
      return mod.exports;
    }
    const code = this.transpile(source, path);
    const run = new Function("require", "module", "exports", "console", "__filename", "__dirname", "process", `${code}\n//# sourceURL=${path}`);
    const process = { env: {}, argv: ["node", path], platform: "browser", cwd: () => "/", exitCode: undefined as number | undefined };
    run((spec: string) => this.require(spec, path), mod, mod.exports, this.console, path, dirname(path), process);
    return mod.exports;
  }
}

function makeConsole(lines: string[]) {
  const write = (...args: unknown[]) => lines.push(args.map((a) => inspect(a)).join(" "));
  return { log: write, info: write, debug: write, warn: write, error: write, table: write, trace: write, dir: write };
}

const describeError = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}${(error as { code?: string }).code === "ERR_ASSERTION" ? " [ERR_ASSERTION]" : ""}: ${error.message}`;
  return `Thrown: ${inspect(error)}`;
};

const done = (lines: string[], code: number): ProjectRun => ({ output: lines.length > 0 ? `${lines.join("\n")}\n` : "", code });

// ── Running a file ───────────────────────────────────────────────────────

/** True when a source file needs the project loader: it pulls in another file, or a Node built-in. */
export function needsProject(code: string): boolean {
  return /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["'](?:\.{1,2}\/|\/|node:)/.test(code) || /["'](?:assert|assert\/strict|test)["']/.test(code);
}

/** `node path/to/file.js` for a file that is part of a project. */
export async function runNodeFile(files: Files, entry: string, transpile: Transpile): Promise<ProjectRun> {
  const lines: string[] = [];
  const loader = new Loader(rooted(files), transpile, makeConsole(lines));
  try {
    loader.load(normalize(entry));
    // A script that registers tests is a test file run directly — Node runs those too.
    if (loader.tests.length > 0) return done(lines, (await runCollected(loader.tests, lines)) ? 0 : 1);
    await settle();
    return done(lines, 0);
  } catch (error) {
    lines.push(`Uncaught ${describeError(error)}`);
    return done(lines, 1);
  }
}

/** Lets promise chains started by top-level code finish printing before the run is reported. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Running tests ────────────────────────────────────────────────────────

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

async function runCollected(tests: Collected[], lines: string[], totals = { pass: 0, fail: 0, skipped: 0, todo: 0 }): Promise<boolean> {
  for (const t of tests) {
    if (t.skip || t.todo) {
      if (t.todo) totals.todo++;
      else totals.skipped++;
      lines.push(`﹣ ${t.name} # ${t.todo ? "TODO" : "SKIP"}`);
      // A skipped test can still be the last one in its suite, and the
      // suite's `after` hooks are owed either way.
      try {
        await closeSuites(t);
      } catch (e) {
        totals.fail++;
        lines.push(`✖ after hook of ${t.name}`, ...describeError(e).split("\n").map((l) => `  ${l}`));
      }
      continue;
    }
    const started = now();
    let failure: unknown;
    let failed = false;
    const sub: string[] = [];
    const context: TestContext = {
      name: t.name,
      // A subtest runs in place; its failure fails the test that holds it.
      test: async (name, fn) => {
        try {
          await fn({ ...context, name });
          sub.push(`  ✔ ${name}`);
        } catch (e) {
          sub.push(`  ✖ ${name}`, ...describeError(e).split("\n").map((l) => `    ${l}`));
          throw e;
        }
      },
      skip: () => undefined,
      todo: () => undefined,
      diagnostic: (message) => sub.push(`  ℹ ${message}`),
    };
    try {
      for (const s of t.hooks) {
        if (!s.started) {
          s.started = true;
          for (const h of s.before) await h();
        }
      }
      for (const s of t.hooks) for (const h of s.beforeEach) await h();
      await t.fn!(context);
      for (const s of [...t.hooks].reverse()) for (const h of s.afterEach) await h();
    } catch (e) {
      failed = true;
      failure = e;
    }
    try {
      await closeSuites(t);
    } catch (e) {
      if (!failed) {
        failed = true;
        failure = e;
      }
    }
    const took = `(${(now() - started).toFixed(1)}ms)`;
    if (failed) {
      totals.fail++;
      lines.push(`✖ ${t.name} ${took}`, ...sub, ...describeError(failure).split("\n").map((l) => `  ${l}`));
    } else {
      totals.pass++;
      lines.push(`✔ ${t.name} ${took}`, ...sub);
    }
  }
  return totals.fail === 0;
}

/** Counts a test as done in each suite it belongs to, running the `after` hooks of any suite that is now finished (and was ever started). */
async function closeSuites(t: Collected): Promise<void> {
  for (const s of [...t.hooks].reverse()) {
    if (--s.remaining === 0 && s.started) for (const h of s.after) await h();
  }
}

/** Node's own default patterns for `node --test` with no file named. */
export function isTestFile(path: string): boolean {
  if (path.includes("/node_modules/")) return false;
  const ext = SOURCE_EXTENSIONS.find((e) => path.endsWith(e));
  if (!ext || ext.endsWith("x")) return false;
  const base = path.slice(path.lastIndexOf("/") + 1, -ext.length);
  if (/(?:^|[.\-_])test$/.test(base) || /^test[.\-_]/.test(base) || base === "test") return true;
  if (/\.spec$/.test(base)) return true;
  return /\/tests?\//.test(path.slice(0, path.lastIndexOf("/") + 1));
}

/**
 * `node --test [files or directories…]`, run from `cwd`. With nothing named
 * it finds the test files under `cwd` the way Node does. Each file is loaded
 * with a module cache of its own, as Node gives each a process of its own.
 */
export async function runNodeTests(files: Files, cwd: string, targets: string[], transpile: Transpile): Promise<ProjectRun> {
  const all = rooted(files);
  const here = normalize(cwd);
  const under = (dir: string) => (dir === "/" ? "/" : `${dir}/`);

  let testFiles: string[];
  if (targets.length === 0) {
    testFiles = Object.keys(all).filter((p) => p.startsWith(under(here)) && isTestFile(p));
  } else {
    testFiles = [];
    for (const target of targets) {
      const path = normalize(target.startsWith("/") ? target : `${here}/${target}`);
      if (all[path] !== undefined) testFiles.push(path);
      else {
        const inside = Object.keys(all).filter((p) => p.startsWith(under(path)) && isTestFile(p));
        if (inside.length === 0) return done([`Could not find '${target}'`], 1);
        testFiles.push(...inside);
      }
    }
  }
  testFiles = [...new Set(testFiles)].sort();

  const lines: string[] = [];
  if (testFiles.length === 0) {
    lines.push("No test files found. node --test looks for *.test.js, *.test.ts, *.spec.js and files under a test/ directory.");
    return done(lines, 1);
  }

  const totals = { pass: 0, fail: 0, skipped: 0, todo: 0 };
  let brokenFiles = 0;
  const started = now();
  for (const file of testFiles) {
    const loader = new Loader(all, transpile, makeConsole(lines));
    try {
      loader.load(file);
    } catch (error) {
      // A file that can't even be loaded is a failure of its own.
      brokenFiles++;
      lines.push(`✖ ${file.slice(1)}`, ...describeError(error).split("\n").map((l) => `  ${l}`));
      continue;
    }
    await runCollected(loader.tests, lines, totals);
  }

  const total = totals.pass + totals.fail + totals.skipped + totals.todo + brokenFiles;
  lines.push(
    `ℹ tests ${total}`,
    `ℹ pass ${totals.pass}`,
    `ℹ fail ${totals.fail + brokenFiles}`,
    `ℹ skipped ${totals.skipped}`,
    `ℹ todo ${totals.todo}`,
    `ℹ duration_ms ${(now() - started).toFixed(1)}`,
  );
  return done(lines, totals.fail + brokenFiles > 0 ? 1 : 0);
}
