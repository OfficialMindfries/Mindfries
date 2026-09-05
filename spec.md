# What is actually built

The PRD ([`System_Archetect_And_PRD.md`](System_Archetect_And_PRD.md)) is the
source of truth for what Mindfries *will* be. This file is the honest state of
the repo today — what exists, what it really does, and where it diverges from
the specced architecture.

If the two disagree, the PRD is right about the destination and this file is
right about the present.

---

## Surface by surface

| PRD surface | Status |
|---|---|
| §1.6 Candidate Engineering Workspace | **Substantially built** — see below |
| §1.11 Internal Admin portal | Scaffolding — routes exist, no data layer |
| §1.4 Company Admin dashboard | Not started |
| §1.5 Candidate Application (invite → setup → enter) | Not started |
| §1.7 Evidence model / telemetry | **Not started** |
| §1.8 Evaluation pipeline | Not started |
| §1.9 AI agents | Not started (chat panel is UI only) |

### `apps/web` — Internal Admin
Next.js routes only: `/admin/companies`, `/admin/library`, `/admin/sessions`,
`/login`. No Supabase, no auth, no API. Not deployed.

### `candidate/backend` — FastAPI
A skeleton: `GET /health`, `GET /status`, CORS configured. Nothing else. No
Daytona, no WebSocket, no database. Not deployed.

### `candidate/frontend` — the workspace
The one substantially built surface, at `/ide`. Deployed on Vercel.

---

## What the workspace genuinely does

The governing rule is **real, or an honest failure** — nothing simulates
success.

**Editor** — Monaco (self-hosted, not CDN), tabbed, dirty-state tracking,
auto-save, real syntax highlighting. `.ipynb` files open as actual notebooks
with executable cells.

**Terminal** — a real shell, not a command dispatcher. Commands are functions
returning `{stdout, stderr, code}` behind a registry, which is what makes
composition work:

- pipes `|`, redirects `> >> < 2>`, chaining `&& || ;` short-circuiting on
  real exit codes
- `$VAR` / `${VAR}` / `$?` expansion, `export`, aliases, globs, quoting
- line editing: history, Tab completion, Ctrl+A/E/U/K/W/C/L, cursor movement
- toolbelt: `grep sed find head tail wc sort uniq cut tr diff tree ls cp -r`

**Execution — genuinely real:**

| Language | How |
|---|---|
| Python | Pyodide — real CPython compiled to WebAssembly |
| JavaScript | Native, as ES modules when the source has imports |
| TypeScript | Transpiled by the actual TypeScript compiler |

**Packages — real registries:**

- `pip install` → micropip: real PyPI wheels plus Pyodide's WASM-built index.
  A package needing a native backend (tensorflow) fails with micropip's own
  message. Installs do **not** survive a refresh.
- `npm install` → real npm registry metadata, code from esm.sh, mirrored into
  a visible `node_modules/`. Installed packages are importable by name. Not
  real npm: no lifecycle scripts, no native addons, no CJS-only packages.

**Version control** — real git via isomorphic-git: real SHA-1 objects, real
commit graph. `init add status commit log branch checkout rm config`.
Storage is hybrid by necessity — git objects are compressed binary and the
workspace filesystem is text-only:

```
/.git/**         → IndexedDB (binary-safe)
everything else  → the VFS (visible in the Explorer)
```

`clone/push/pull` need a CORS proxy or a backend, and refuse honestly.

**Projects** — `npm create vite@latest <name> -- --template react` fetches the
**real** create-vite template from jsDelivr. `dev` / `npm run dev` then builds
and serves it in a live preview: JSX through the real TypeScript compiler,
imports resolved to the user's own modules and installed packages, rebuilt on
every edit. It holds the terminal like a real dev server and exits on Ctrl+C.
It is not Vite — no HMR, no plugins, no production build.

**Proctoring** — the session requires a live camera. The workspace is locked
until the stream starts and re-locks if it stops. The candidate is told before
the permission prompt and sees their own feed throughout.

**Persistence** — the whole workspace is in `localStorage`; npm packages and
git objects in IndexedDB. This browser only.

---

## The two divergences that matter

**1. Browser-only, not sandboxed.** The PRD specifies **Daytona** sandboxes
driven by the **FastAPI monolith over WebSocket** (§2.3). The workspace today
runs entirely client-side. Everything above is a real local approximation, but
the specced execution model is a real machine — and only that unlocks the
things a browser structurally cannot do: `pip install tensorflow`, `gcc`,
arbitrary binaries, a dev server on a real port.

**2. No telemetry.** §1.7 — capturing navigation, code changes, commands,
tests, debugging and AI usage as evidence — is the product's whole
differentiator, and the workspace emits none of it. Every feature added
produces evidence-worthy signals that currently vanish.

Also unbuilt from the §1.6 layout: task description panel, timer, submit,
git-changes view, diff viewer, test results, and the AI **interviewer**
(distinct from the assistant). The chat panel is interface only — no model is
connected; its assistant turn says so rather than inventing answers.
