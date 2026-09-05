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

import pyodidePackage from "pyodide/package.json" with { type: "json" };

/**
 * Where `pip install` fetches wheels from.
 *
 * The pyodide npm package ships the runtime but **no packages at all** — not
 * even micropip. Since `indexURL` points at our self-hosted copy, every
 * `loadPackage()` would 404 against our own server ("Failed to fetch") and
 * `pip` would be broken for everyone. Package downloads inherently need the
 * network anyway (that's what a package manager does), so wheels come from
 * the official CDN for exactly the version we ship, while the runtime itself
 * stays self-hosted and works offline.
 */
const PACKAGE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/v${pyodidePackage.version}/full/`;

declare global {
  interface Window {
    loadPyodide?: (options: {
      indexURL: string;
      packageBaseUrl?: string;
    }) => Promise<PyodideInterface>;
  }
}

export interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
  /** Loads a package from Pyodide's own WASM-built index (numpy, pandas, ...). */
  loadPackage: (
    names: string | string[],
    options?: { messageCallback?: (text: string) => void; errorCallback?: (text: string) => void }
  ) => Promise<unknown>;
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
      return window.loadPyodide({ indexURL: "/pyodide/", packageBaseUrl: PACKAGE_CDN_URL });
    })();
  }
  return pyodidePromise;
}

export function isPyodideReady(): boolean {
  return pyodidePromise !== null;
}
