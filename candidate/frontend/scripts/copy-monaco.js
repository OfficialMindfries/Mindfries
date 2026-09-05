// Self-hosts Monaco's editor assets under public/ so the workspace editor
// doesn't depend on loading them from a CDN at runtime (@monaco-editor/react
// defaults to jsdelivr, which we deliberately don't rely on — see
// src/components/ide/EditorPanel.tsx). Runs automatically via the
// "postinstall" script, and again explicitly before `next build` in
// Dockerfile since the Docker build stage that runs `npm ci` isn't the
// same stage that carries the final `public/` directory forward.
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(__dirname, "..", "public", "monaco-editor", "vs");

if (!fs.existsSync(src)) {
  console.warn(`[copy-monaco] source not found at ${src}, skipping`);
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`[copy-monaco] copied Monaco assets to ${path.relative(process.cwd(), dest)}`);
