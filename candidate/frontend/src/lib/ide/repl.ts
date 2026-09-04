import { formatError, formatLogArguments, formatValue } from "./repl-format";

/**
 * The evaluator behind the Debug Console.
 *
 * ## Why an iframe, and not `new Function`
 *
 * A REPL has to remember what you declared: type `const x = 1`, then `x`. The
 * existing `code-runner` uses `new Function`, whose declarations vanish when
 * the call returns — fine for running a file, useless for a REPL.
 *
 * A classic `<script>` element, by contrast, puts top-level `let`/`const`/
 * `class` into its realm's *global lexical environment*, where they survive
 * for the next script. That is the same mechanism Node's REPL relies on, and
 * it's the only way to get real declaration persistence without rewriting the
 * user's code behind their back.
 *
 * The scripts go into a hidden same-origin iframe rather than this page, for
 * three reasons:
 *
 * 1. **Isolation.** Candidate code can't overwrite globals the workspace
 *    itself depends on.
 * 2. **Errors stay put.** An uncaught error in the main page is intercepted
 *    by Next's dev overlay, so a typo in the console would throw a
 *    full-screen error dialog over the IDE. In the iframe the `error` event
 *    fires on the iframe's own window, which nothing else listens to.
 * 3. **It matches VS Code.** Its Debug Console evaluates in the debugger's
 *    context, which is already separate from whatever the terminal is
 *    running — a shared context would be the less faithful choice, not the
 *    more faithful one.
 *
 * The cost is stated plainly in the panel: this session is separate from
 * `node script.js` in the terminal.
 */

export interface ReplOutcome {
  logs: string[];
  /** Node-style inspection of the completion value, or null if there is nothing to echo. */
  display: string | null;
  errored: boolean;
}

const RESULT = "__mindfriesReplResult";

type Realm = Window & Record<string, unknown>;

let frame: HTMLIFrameElement | null = null;
let sink: string[] = [];
let thrown: { value: unknown } | null = null;

/** Creates (or reuses) the hidden realm the console evaluates in. */
function realm(): Realm {
  if (frame?.contentWindow) return frame.contentWindow as Realm;

  const element = document.createElement("iframe");
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("title", "Debug console runtime");
  element.style.display = "none";
  // No `src`: the iframe gets a live, same-origin about:blank document
  // synchronously on append, which is what lets us inject into it right away.
  document.body.appendChild(element);
  frame = element;

  const win = element.contentWindow as Realm;

  // Console output is captured rather than dropped — a REPL where
  // `console.log` goes nowhere would be worse than no REPL at all.
  const capture =
    () =>
    (...args: unknown[]) => {
      sink.push(formatLogArguments(args));
    };
  win.console = {
    ...(win.console as unknown as Console),
    log: capture(),
    info: capture(),
    warn: capture(),
    error: capture(),
    debug: capture(),
  } as Console;

  win.addEventListener("error", (event) => {
    thrown = { value: event.error ?? event.message };
    event.preventDefault();
  });
  win.addEventListener("unhandledrejection", (event) => {
    thrown = { value: (event as PromiseRejectionEvent).reason };
    event.preventDefault();
  });

  return win;
}

/**
 * A thrown error's stack continues down into the host: the React event
 * handler that called the evaluator, and React's own dispatch machinery. None
 * of those frames are the candidate's code, and showing them buries the one
 * line that matters under ten that don't. Everything from the first host
 * frame onward is dropped, leaving the message and the frames inside the
 * evaluated snippet — which is what a browser console shows for a typo.
 */
function describeThrow(value: unknown): string {
  const lines = formatError(value).split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (kept.length > 0 && /_next|evaluateRepl/.test(line)) break;
    kept.push(line);
  }
  const text = kept.join("\n");

  // A `let` binding lives in the realm's global lexical environment, and
  // nothing can remove it — re-running `let x = 1` is a genuine SyntaxError,
  // not something to paper over. Node's REPL gets to allow it because it
  // drives V8 directly; page JavaScript can't. So the error stands, with the
  // one thing that does fix it attached to it.
  if (/has already been declared/.test(text)) {
    return `${text}\n    Pick another name, or reset the session (↺) to clear every declaration.`;
  }
  return text;
}

/**
 * Reading through a function rather than the variable directly: the listeners
 * that set it are callbacks, which TypeScript's control-flow analysis can't
 * see, so a direct read narrows to `null` and the error path looks dead.
 */
function takeThrown(): { value: unknown } | null {
  const current = thrown;
  thrown = null;
  return current;
}

/** Discards every declaration and starts a fresh realm — VS Code restarts the console per debug session. */
export function resetRepl(): void {
  frame?.remove();
  frame = null;
}

type Shape = { kind: "expression" | "statements"; async: boolean };

/**
 * Works out how to run the input by compiling candidate wrappers with
 * `new Function`, which parses without executing — so nothing runs twice.
 *
 * The expression form is tried first, so `{ a: 1 }` is an object literal
 * rather than a block containing a label. Node's REPL makes the same choice,
 * for the same reason: it's what the person typing meant.
 */
function analyze(code: string): Shape | null {
  const attempts: [string, Shape][] = [
    // `class Point {}` and `function f() {}` parse as expressions when
    // wrapped in parens, and would then evaluate to a value that binds no
    // name — so `new Point()` on the next line fails. They're declarations
    // here, as they are in Node's REPL and in devtools.
    ...(/^\s*(?:class\b|function\b|async\s+function\b)/.test(code)
      ? []
      : ([
          [`return (\n${code}\n)`, { kind: "expression", async: false }],
          [`return (async () => (\n${code}\n))`, { kind: "expression", async: true }],
        ] as [string, Shape][])),
    [code, { kind: "statements", async: false }],
    [`return (async () => {\n${code}\n})`, { kind: "statements", async: true }],
  ];
  for (const [source, shape] of attempts) {
    try {
      new Function(source);
      return shape;
    } catch {
      // Try the next shape; if every one fails, the input is a syntax error.
    }
  }
  return null;
}

/**
 * Top-level `await` in statement position has to run inside an async wrapper,
 * and a declaration inside that wrapper wouldn't outlive it. Promoting the
 * single-binding case to a global assignment keeps `const data = await f()`
 * working the way it reads. Anything more elaborate (destructuring, several
 * declarators) still runs, but doesn't persist — which the panel says out loud.
 */
function promoteDeclaration(code: string): string {
  const match = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=([\s\S]+)$/.exec(code);
  if (!match) return code;
  const [, name, initializer] = match;
  const body = initializer.trim().replace(/;\s*$/, "");
  // A lone declaration only: anything with a second statement after it is
  // left alone rather than half-rewritten.
  if (/;\s*\S/.test(body)) return code;
  return `globalThis.${name} = (${body});`;
}

/**
 * `count++; count` should echo `1`, the way it does in Node and in devtools —
 * a statement list still has a completion value. A `<script>` can't return
 * one, so the last expression is split off and assigned instead.
 *
 * Split points are tried from the end, and a split is only accepted when
 * *both* halves parse on their own. That's what makes the heuristic safe: a
 * newline inside a template literal, or a `;` inside a `for(;;)` header,
 * leaves one half unparseable, so the split is rejected and the input runs
 * unchanged. Both halves stay in the same injected script, so a `let` in the
 * first half still persists.
 */
function splitCompletion(code: string): { head: string; tail: string } | null {
  for (let i = code.length - 1; i > 0; i--) {
    if (code[i] !== ";" && code[i] !== "\n") continue;
    const head = code.slice(0, i);
    const tail = code.slice(i + 1);
    if (!tail.trim() || !head.trim()) continue;
    if (analyze(tail)?.kind !== "expression") continue;
    // The head only has to parse — an expression is a statement too, which is
    // what makes `count++; count` splittable. It must not need `await`,
    // though: that can't run at the top level of a classic script.
    const head_ = analyze(head);
    if (!head_ || head_.async) continue;
    return { head, tail };
  }
  return null;
}

function buildSource(code: string, shape: Shape): string {
  if (shape.kind === "expression") {
    return shape.async
      ? `globalThis.${RESULT} = (async () => (\n${code}\n))();`
      : `globalThis.${RESULT} = (\n${code}\n);`;
  }
  if (shape.async) {
    return `globalThis.${RESULT} = (async () => {\n${promoteDeclaration(code)}\n})();`;
  }
  const split = splitCompletion(code);
  if (split) return `${split.head};\nglobalThis.${RESULT} = (${split.tail});`;
  // Otherwise injected verbatim, with nothing prepended: a wrapper would put
  // top-level `let`/`const` into a nested scope so they'd stop persisting,
  // and even a leading line would shift every line number in a stack trace.
  // `RESULT` is cleared from the parent before injection instead.
  return code;
}

/** Strips types with the real compiler, so `const n: number = 1` is accepted. */
async function transpile(code: string): Promise<{ code: string } | { error: string }> {
  const ts = await import("typescript");
  const { outputText, diagnostics } = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length > 0) {
    return { error: ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n") };
  }
  return { code: outputText };
}

/**
 * Evaluates one console entry. Plain JavaScript never loads the TypeScript
 * compiler — it's reached only for input the JS parser rejected, which keeps
 * the common case free of a multi-megabyte import.
 */
export async function evaluateRepl(input: string): Promise<ReplOutcome> {
  const code = input.trim();
  if (!code) return { logs: [], display: null, errored: false };

  let source = code;
  let shape = analyze(source);

  if (!shape) {
    const transpiled = await transpile(code);
    if ("error" in transpiled) {
      return { logs: [], display: `SyntaxError: ${transpiled.error}`, errored: true };
    }
    source = transpiled.code;
    shape = analyze(source);
    if (!shape) return { logs: [], display: "SyntaxError: Unexpected token", errored: true };
  }

  const win = realm();
  const logs: string[] = [];
  sink = logs;
  thrown = null;
  win[RESULT] = undefined;

  const script = win.document.createElement("script");
  script.textContent = buildSource(source, shape);
  win.document.head.appendChild(script);
  script.remove();

  const syncError = takeThrown();
  if (syncError) return { logs, display: describeThrow(syncError.value), errored: true };

  let value = win[RESULT];
  if (shape.async) {
    try {
      value = await (value as Promise<unknown>);
    } catch (err) {
      return { logs, display: describeThrow(err), errored: true };
    }
    const asyncError = takeThrown();
    if (asyncError) return { logs, display: describeThrow(asyncError.value), errored: true };
  }

  return { logs, display: formatValue(value), errored: false };
}
