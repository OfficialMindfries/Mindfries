import { getPyodide } from "./pyodide-runtime";

export interface RunResult {
  output: string[];
  errored: boolean;
}

/**
 * Real JS execution (the user's own code, in their own browser tab — same
 * trust boundary as devtools). Shared by the terminal's `node`/`js`
 * commands and notebook code cells.
 */
export function runJavaScript(code: string): RunResult {
  const output: string[] = [];
  const fakeConsole = {
    log: (...a: unknown[]) => output.push(a.map(String).join(" ")),
    error: (...a: unknown[]) => output.push(a.map(String).join(" ")),
    warn: (...a: unknown[]) => output.push(a.map(String).join(" ")),
    info: (...a: unknown[]) => output.push(a.map(String).join(" ")),
  };
  try {
    const run = new Function("console", code);
    run(fakeConsole);
    return { output, errored: false };
  } catch (err) {
    output.push(`Uncaught ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return { output, errored: true };
  }
}

/**
 * Real Python execution via Pyodide (CPython-in-WASM). Runs on the SAME
 * shared Pyodide instance every caller uses, so — like a real Jupyter
 * kernel — variables/imports from one call are still around for the next
 * (this is what makes notebook cells behave like notebook cells).
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
