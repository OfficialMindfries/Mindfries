# In-Browser Workspace IDE — Specification

Route: [`/ide`](page.tsx) · Source root: `candidate/frontend/src/{app/ide,components/ide,lib/ide}`

## 1. Overview

A VS Code-style IDE that runs entirely in the browser: file explorer, tabbed Monaco
editor, a Linux-like terminal, and Jupyter notebook support — with **real code
execution** (JavaScript natively, Python via Pyodide/WebAssembly) and no backend.

It does not talk to `candidate/backend` or any server. A "workspace" is this
browser's `localStorage`: files created here live here, and running a script means
actually executing it, in this tab, against files created in this tab.

## 2. Goals

- Feel like a real, small IDE — not a mockup with canned responses.
- Where something is simulated (the filesystem) vs. real (the shell, script
  execution, syntax highlighting, file icons), make that legible rather than
  papering over it with fake success states.
- Reuse real upstream assets (Monaco, Pyodide, [devicon](https://github.com/devicons/devicon)
  brand SVGs) instead of hand-rolled approximations.

## 3. Non-goals

- No real disk, process model, package manager, or network access from the terminal.
- No multi-user collaboration, no server-side persistence, no auth.
- Not a full language-server / LSP experience — syntax highlighting only, no
  autocomplete-from-types, no linting-as-you-type beyond what Monaco does natively.
- Not a complete nbformat/CommonMark implementation (see §8).

## 4. Feature areas

### 4.1 Shell & layout (`IdeShell.tsx`)
Single source of truth for the file tree, file contents, saved/dirty state, open
tabs, and active tab. Composes:
- **`FileExplorer`** — sidebar tree; create/rename/delete files and folders,
  inline-editable names, drag-resizable width.
- **`EditorPanel`** — tabbed Monaco editor (or `NotebookEditor` for `.ipynb`);
  syntax highlighting, Ctrl/Cmd+S, per-tab dirty-state dot.
- **`BottomPanel` → `TerminalGroup` → `TerminalPanel`** — Problems / Output /
  Debug Console / Terminal / Ports tab strip; the Terminal tab supports multiple
  independent terminal sessions, each with its own scrollback and `cwd`.
- **`StatusBar`** — bottom bar; theme toggle (moon/sun) lives here.

### 4.2 Virtual filesystem (`lib/ide/vfs-bridge.ts`, `tree.ts`, `vfs-path.ts`)
A single in-memory tree, mutated only through a typed `VfsBridge` interface
(`getSnapshot`, `createFile`, `createFolder`, `remove`, `write`, `move`) so the
Explorer, Editor, and Terminal are always looking at the same state — `touch x.py`
in the terminal shows up in the sidebar instantly, and `cat` reflects exactly
what's in the editor.

Because the terminal runs from an `xterm.js` callback outside React's render
cycle, reads need to be synchronous: a `vfsSnapshotRef` is kept in sync every
render for that purpose, while all mutations go through React's functional
`setState` so they can never act on stale state.

### 4.3 Terminal (`components/ide/vfs-shell.ts` + `lib/ide/shell/`)
A real shell, split into a line editor (`vfs-shell.ts`: history, Tab
completion, cursor movement, Ctrl+C/L/A/E/U/K/W) and an execution engine
(`lib/ide/shell/`), which is what makes real shell *composition* possible:

**Engine** — `parser.ts` tokenizes with proper quoting rules and parses into
pipelines joined by operators; `execute.ts` wires stdin/stdout between
commands, applies redirects, and tracks exit status. Commands are functions
returning `{stdout, stderr, code}` (`registry.ts` maps names to them), not
code that writes to the terminal — that separation is precisely what lets
`a | b` work at all, and it means the engine is testable without a browser.

| Feature | Support |
|---|---|
| Pipes | `cat f \| grep x \| wc -l` |
| Redirects | `>` `>>` `<` `2>` |
| Chaining | `&&` `\|\|` `;` — short-circuiting on real exit codes |
| Variables | `export FOO=bar`, `$FOO`, `${FOO}`, `$?`, `FOO=bar cmd` |
| Globs | `*.ts`, `src/*`, `?` — unmatched patterns stay literal, like bash |
| Quoting | `'literal'` vs `"expanded"` vs `\escaped` |
| Aliases | `alias ll='ls -1'` |

| Commands | |
|---|---|
| Files | `ls` (`-l -a -1`), `cd` (incl. `cd -`), `pwd`, `cat`, `touch`, `mkdir -p`, `rm -r -f`, `mv`, `cp -r`, `find -name -type`, `tree` |
| Text | `echo`, `grep` (`-i -n -v -c -r`), `sed s///`, `head`, `tail`, `wc`, `sort` (`-n -r -u`), `uniq` (`-c -d`), `cut`, `tr`, `diff` |
| Run | `node`/`js`, `ts-node`/`tsx`, `python`/`python3` (incl. `-c`) |
| Packages | `pip install/list/show`, `npm install/list/uninstall` |
| Network | `curl` (`-o -s -I`), `wget` |
| Shell | `export`, `env`, `unset`, `alias`, `unalias`, `which`, `history`, `clear`, `whoami`, `date`, `uname`, `help` |

Errors and exit codes are real: `grep` exits 1 when nothing matches, `diff`
exits 1 when files differ, an unknown command exits 127 — so `&&`/`||` branch
on genuine status, not on a guess.

### 4.3.1 Packages (`lib/ide/shell/commands/pkg.ts`, `lib/ide/packages.ts`)
- **`pip`** — real installs via **micropip**, the package manager Pyodide
  ships. It resolves against Pyodide's WASM-built index first (numpy, pandas,
  scikit-learn, matplotlib and ~200 more) and falls back to real pure-Python
  wheels from PyPI. Packages needing a compiled native/GPU backend
  (tensorflow, torch) have no WASM build and genuinely cannot install —
  micropip's own error is surfaced verbatim rather than dressed up.
- **`npm`** — real metadata from the real npm registry and real ESM code from
  esm.sh, recorded in a manifest that persists in this browser. Installed
  packages become importable by name: the JS/TS runner rewrites bare
  specifiers to the CDN URL for the installed version and executes the file
  as a genuine ES module. **Not** real npm: no `node_modules`, no lifecycle
  scripts, no native addons, and packages that never ship ESM won't work.

### 4.3.2 Version control (`lib/ide/git/`, `shell/commands/git.ts`)
Real git via **isomorphic-git** — real SHA-1 objects and a real commit graph,
not simulated output. Storage is deliberately hybrid, because git objects are
compressed binary while the workspace VFS is text-only:

```
/.git/**          -> IndexedDB   (binary-safe)
everything else   -> the VFS     (visible and editable in the Explorer)
```

Supported: `init`, `add` (incl. `.`), `status`, `commit -m`, `log [--oneline]`,
`branch`, `checkout [-b]`, `rm`, `config`. `clone`/`push`/`pull`/`fetch` need
a CORS proxy or the backend executor and refuse honestly rather than pretend.

### 4.3.3 Packages left over from a previous session (`components/ide/PackageCleanupGuard.tsx`)
Opening the workspace when a previous session left packages downloaded asks
whether to keep them: *Keep them* / *Yes, delete*. Deleting clears the
manifest and the `node_modules/` mirror, so "deleted" means gone from the
Explorer too. It fires once per tab — `sessionStorage` survives a refresh and
dies with the tab — and only when there is something to clean up.

**Why it asks on the way in, not on the way out.** The obvious design is to
ask while the tab closes, and it cannot be done: a page **cannot** put custom
buttons in the close prompt. `beforeunload` yields the browser's own
two-button "Leave site?" dialog and nothing else, by design — it's what stops
a page trapping you in a tab.

An earlier version fired `beforeunload` anyway and showed the real dialog to
whoever cancelled it. It worked, but it meant every exit was met with a
browser warning the workspace didn't want and couldn't style: a native dialog
to reach a real one, over a question about cached downloads. The question
moved to the one moment the app owns completely instead. Nothing is lost by
asking later — the packages are in browser storage either way — and the
candidate gets to see what a previous session left behind before building on
top of it.

It waits for the proctoring gate: both are modal, and asking about packages
behind a "you cannot start yet" dialog reads as a stack of broken overlays.

### 4.3.4 Ending the session (`components/ide/EndSession.tsx`)
The Explorer's footer, beside the candidate's name, carries an **End session**
control. It opens the workspace's own confirmation — *Cancel* / *End, keep
packages* / *End & delete* when packages exist, *Cancel* / *End session* when
they don't. Confirming stops the preview, optionally deletes the packages and
their `node_modules/` mirror, releases the camera, and replaces the workspace
with a closing screen.

This is the answer to the close-prompt problem above: the only way to get a
real confirmation with real choices is to own the exit. A control inside the
workspace, pressed deliberately, with no browser dialog anywhere near it.

The flow stops at a screen rather than closing the tab, because
`window.close()` only works on a window a script opened itself. Files are left
alone — the work is the candidate's, and nothing has been submitted. Finality
is a client-side gesture for now: a real assessment ends when the server says
it ended (PRD §2.3).

### 4.4 Code execution (`lib/ide/code-runner.ts`, `pyodide-runtime.ts`)
Shared by the terminal's `node`/`python` commands and notebook code cells:
- **JavaScript** — `new Function("console", code)`; `console.log/warn/error`
  captured into terminal/cell output. Same trust boundary as the browser devtools
  console: it's the user's own code, in their own tab.
- **TypeScript** — supported out of the box, no separate install step: `node`
  (or the `ts-node`/`tsx` aliases) on a `.ts`/`.tsx` file transpiles it with the
  real [TypeScript compiler](https://www.npmjs.com/package/typescript)
  (`ts.transpileModule`, dynamically imported so it's not in the initial
  bundle) and runs the emitted JS through the same path as `node`. This is a
  single-file, no-filesystem transform (like Babel) — real syntax errors
  surface, but there's no cross-file type-checking, matching the existing
  no-imports single-file execution model.
- **Python** — [Pyodide](https://pyodide.org), self-hosted under `public/pyodide/`
  (copied from the npm package by `scripts/copy-pyodide.js`), loaded lazily via an
  injected `<script>` tag on first use (**not** `import` — Pyodide's npm package
  pulls in a Node-only `ws` dependency that breaks Turbopack/webpack bundling). One
  Pyodide instance is shared for the whole session, so state persists across runs
  like a real kernel.

Beyond JS/TS/Python, running an unsupported language gives a real
"command not found", not a fake success — see
[issue #4](https://github.com/RishiGoswami-code/Mindfries/issues/4).

### 4.5 Jupyter notebooks (`lib/ide/notebook.ts`, `components/ide/NotebookEditor.tsx`)
Opening a `.ipynb` file swaps Monaco for a notebook UI: code/markdown cells, a
▶ Run button per cell, `Run All`, `+ Code` / `+ Markdown`. Code cells execute
through the same shared Pyodide instance the terminal uses, so kernel state
persists across cells (a variable set in cell 1 is readable in cell 2).

Content round-trips through real nbformat v4 JSON (`parseNotebook`/
`serializeNotebook`), scoped down to: code + markdown cells, plain-text
stdout/stderr output only (no rich display data — see
[issue #6](https://github.com/RishiGoswami-code/Mindfries/issues/6)). Markdown
cells render through `tiny-markdown.tsx`, a minimal renderer (headers, bold/
italic, inline code, lists — not full CommonMark).

### 4.6 File-type icons (`components/ide/FileTypeIcon.tsx`)
~65 extensions/filenames mapped to real brand SVGs sourced from `devicon` at
build time (`scripts/copy-file-icons.js` → `public/file-icons/`), plus
filename-based overrides (`package.json` → npm, `Dockerfile` → Docker,
`.gitignore` → git). TS/JS use hand-styled letter badges matching their real logos.

### 4.7 Branding & theming (`lib/ide/palette.ts`, `theme.tsx`)
Full VS Code-style Dark+/Light+ color system built entirely from the Mindfries
five-swatch brand palette (darkest to lightest): `#0A1931`, `#1A3D63`,
`#4A7FA7`, `#B3CFE5`, `#F6FAFD` — no ad-hoc greys. The accent color and status
bar use the mid-blue (`#4A7FA7`); the terminal prompt uses the same blue via
24-bit ANSI true-color. The Mindfries logo is a traced SVG
(`public/mindfries-logo.svg`, fill `#4A7FA7`), used in the Explorer header and
as the site favicon (`src/app/icon.svg`). Theme choice persists to
`localStorage`; toggling paints `document.body` directly to avoid a
light-mode flash.

### 4.8 Persistence (`lib/ide/fs-persist.ts`)
The whole workspace (file tree, file contents, saved/dirty state, open tabs,
active tab) is debounce-saved to `localStorage` under the key
`mindfries-ide-workspace` on every change, and restored on mount. Auto Save is
on by default (edits are marked saved ~800ms after typing stops); there is no
setting to disable it yet (see
[issue #7](https://github.com/RishiGoswami-code/Mindfries/issues/7)). A failed
write (e.g. quota exceeded) is currently swallowed silently (see
[issue #8](https://github.com/RishiGoswami-code/Mindfries/issues/8)).

## 5. Data model

```ts
// lib/ide/types.ts (tree)
type TreeNode =
  | { type: "file"; name: string; path: string }
  | { type: "folder"; name: string; path: string; children: TreeNode[] };

// lib/ide/fs-persist.ts
interface PersistedWorkspace {
  tree: TreeNode[];
  files: Record<string, string>;      // path -> current (possibly dirty) content
  savedFiles: Record<string, string>; // path -> last-saved content
  openPaths: string[];
  activePath: string | null;
}

// lib/ide/notebook.ts (nbformat v4, narrowed)
interface NotebookCell {
  id: string;
  cellType: "code" | "markdown";
  source: string;
  outputs: string[]; // text-only
}
interface NotebookDoc {
  cells: NotebookCell[];
  kernelLanguage: "python" | "javascript";
}
```

## 6. Non-functional requirements

- **No network calls to a backend.** Everything runs client-side.
- **Monaco and Pyodide are self-hosted**, not CDN-loaded (the target environment
  blocks third-party CDNs for the editor; Pyodide's npm package can't be bundled).
- **Pyodide loads lazily**, only when a Python command/cell actually runs — not on
  page load (~13MB payload).
- **Cross-theme legibility**: every brand color (logo, accent, status bar,
  terminal prompt) must render correctly in both dark and light mode.

## 7. Verification summary

`eslint` and `next build` pass on every change. Every feature area above was
exercised live in a browser: file/folder CRUD, terminal fs commands, multiple
concurrent terminal sessions, real Python execution (including a notebook
sharing kernel state across cells), real JS execution, theme toggle both
directions, and a full refresh-persistence round trip.

## 8. Known limitations / out of scope

See [task.md](task.md#backlog--known-limitations) for the full list and links to
the filed GitHub issues (#4–#8).
