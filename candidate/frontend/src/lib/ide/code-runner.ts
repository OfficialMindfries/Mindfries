import { moduleUrlFor } from "./packages";
import { getPyodide } from "./pyodide-runtime";

export interface RunResult {
  output: string[];
  errored: boolean;
}

function collector(output: string[]) {
  const format = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a) ?? String(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  return {
    log: (...a: unknown[]) => output.push(format(a)),
    error: (...a: unknown[]) => output.push(format(a)),
    warn: (...a: unknown[]) => output.push(format(a)),
    info: (...a: unknown[]) => output.push(format(a)),
    debug: (...a: unknown[]) => output.push(format(a)),
  };
}

/** ESM syntax means the code has to run as a real module, not inside `new Function`. */
export function hasModuleSyntax(code: string): boolean {
  return /^\s*import\s|^\s*export\s|^\s*import\(/m.test(code);
}

/**
 * Real JS execution (the user's own code, in their own browser tab — same
 * trust boundary as devtools). Synchronous fast path for plain scripts;
 * module code goes through `runJavaScriptSource` instead.
 */
export function runJavaScript(code: string): RunResult {
  const output: string[] = [];
  try {
    const run = new Function("console", code);
    run(collector(output));
    return { output, errored: false };
  } catch (err) {
    output.push(`Uncaught ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return { output, errored: true };
  }
}

/**
 * Rewrites bare specifiers (`react`) to the CDN URL for the installed
 * version, leaving relative paths and absolute URLs alone — this is what
 * makes `npm install`ed packages importable from a script.
 */
function rewriteBareImports(code: string): string {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g,
    (match, prefix: string, quote: string, specifier: string) => {
      const isRelativeOrUrl = /^[./]/.test(specifier) || /^[a-z]+:/i.test(specifier);
      if (isRelativeOrUrl) return match;
      return `${prefix}${quote}${moduleUrlFor(specifier)}${quote}`;
    }
  );
}

/**
 * Runs module code for real: bare imports are resolved to the installed
 * package's CDN build, the source becomes a Blob URL, and the browser
 * imports it as a genuine ES module (top-level await included).
 *
 * `console` is patched for the duration rather than injected as a parameter —
 * a real module can't take arguments the way `new Function` can.
 */
async function runJavaScriptModule(code: string): Promise<RunResult> {
  const output: string[] = [];
  const blob = new Blob([rewriteBareImports(code)], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const original = globalThis.console;

  try {
    globalThis.console = { ...original, ...collector(output) } as Console;
    // Built through `new Function` so the bundler leaves this dynamic import
    // alone instead of trying to statically resolve a Blob URL at build time.
    const importModule = new Function("url", "return import(url)") as (u: string) => Promise<unknown>;
    await importModule(url);
    return { output, errored: false };
  } catch (err) {
    output.push(`Uncaught ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return { output, errored: true };
  } finally {
    globalThis.console = original;
    URL.revokeObjectURL(url);
  }
}

/** Runs JavaScript, picking the module or plain-script path automatically. */
export async function runJavaScriptSource(code: string): Promise<RunResult> {
  return hasModuleSyntax(code) ? runJavaScriptModule(code) : runJavaScript(code);
}

/**
 * Real TypeScript execution: strip types with the actual TypeScript compiler
 * (`typescript`, dynamically imported so it's not in the initial bundle —
 * the same lazy-load treatment as Pyodide), then run the emitted JS.
 * `transpileModule` is a single-file, no-filesystem transform (like Babel) —
 * it catches real syntax errors, but does no cross-file type-checking.
 */
export async function runTypeScript(code: string): Promise<RunResult> {
  const ts = await import("typescript");
  const isModule = hasModuleSyntax(code);
  const { outputText, diagnostics } = ts.transpileModule(code, {
    compilerOptions: {
      // Imports must survive transpilation for module code, so the emitted
      // JS can still be run as a real ES module.
      module: isModule ? ts.ModuleKind.ESNext : ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });

  if (diagnostics && diagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n");
    return { output: [`Uncaught SyntaxError: ${message}`], errored: true };
  }
  return isModule ? runJavaScriptModule(outputText) : runJavaScript(outputText);
}

/**
 * Real Python execution via Pyodide (CPython-in-WASM). Runs on the SAME
 * shared Pyodide instance every caller uses, so — like a real Jupyter
 * kernel — variables/imports from one call are still around for the next
 * (this is what makes notebook cells behave like notebook cells, and what
 * lets a `pip install`ed package stay importable afterwards).
 */
export async function runPython(code: string): Promise<RunResult> {
  const output: string[] = [];
  let errored = false;
  const pyodide = await getPyodide();
  pyodide.setStdout({ batched: (text) => output.push(text) });
  pyodide.setStderr({ batched: (text) => output.push(text) });
  try {
    await pyodide.runPythonAsync(code);
  } catch (err) {
    errored = true;
    output.push(err instanceof Error ? err.message : String(err));
  }
  return { output, errored };
}
