/**
 * Lazily loads the self-hosted Pyodide runtime (real CPython compiled to
 * WebAssembly — see scripts/copy-pyodide.js) and hands back a singleton
 * instance shared by every terminal in the app, so Python only initializes
 * once no matter how many `python` commands get run.
 *
 * Pyodide's npm package carries a Node-only dependency (`ws`) that breaks
 * when bundled by webpack/Turbopack, so it's intentionally not `import`ed —
 * instead pyodide.js (a classic script that sets `window.loadPyodide`) is
 * injected as a <script> tag, exactly like loading it from a CDN would
 * work, just served from our own /public/pyodide/ instead.
 */

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

export interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
}

let pyodidePromise: Promise<PyodideInterface> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/** Resolves once Pyodide is ready. Safe to call repeatedly — subsequent calls reuse the same instance. */
export function getPyodide(): Promise<PyodideInterface> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      await loadScript("/pyodide/pyodide.js");
      if (!window.loadPyodide) {
        throw new Error("pyodide.js loaded but did not define window.loadPyodide");
      }
      return window.loadPyodide({ indexURL: "/pyodide/" });
    })();
  }
  return pyodidePromise;
}

export function isPyodideReady(): boolean {
  return pyodidePromise !== null;
}
