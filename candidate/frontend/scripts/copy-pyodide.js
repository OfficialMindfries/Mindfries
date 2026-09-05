// Self-hosts the Pyodide runtime (real CPython compiled to WebAssembly)
// under public/, so the workspace terminal can actually execute Python
// scripts in-browser — not fake it. Loaded lazily at runtime only when a
// `python`/`python3` command is actually run (see pyodide-runtime.ts),
// same self-hosting pattern as scripts/copy-monaco.js.
const fs = require("node:fs");
const path = require("node:path");

const srcDir = path.join(__dirname, "..", "node_modules", "pyodide");
const destDir = path.join(__dirname, "..", "public", "pyodide");

// Runtime files only — skipping .map/.d.ts/README/console.html, which are
// only useful for local development against the pyodide package itself.
const FILES = [
  "pyodide.js",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!fs.existsSync(srcDir)) {
  console.warn(`[copy-pyodide] source not found at ${srcDir}, skipping`);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const name of FILES) {
  const src = path.join(srcDir, name);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-pyodide] missing "${name}"`);
    continue;
  }
  fs.copyFileSync(src, path.join(destDir, name));
  copied++;
}

console.log(`[copy-pyodide] copied ${copied}/${FILES.length} files to public/pyodide/`);
