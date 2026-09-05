# Notes for Claude Code — working in `src/app/ide`

Read [spec.md](spec.md) for what this feature is and [task.md](task.md) for
what's done vs. backlog. This file is the "don't re-learn these the hard way"
list for anyone (human or agent) touching this code next.

## Mental model

`IdeShell.tsx` owns everything: the file tree, file contents, saved/dirty
state, open tabs, active tab. Explorer, Editor, and Terminal are all just
views over that one piece of state, talking to it through `VfsBridge`
(`lib/ide/vfs-bridge.ts`). If you're adding a feature that needs to know "what
files exist" or "what's in this file," go through the bridge — don't invent a
second copy of file state anywhere.

The one wrinkle: the terminal (`vfs-shell.ts`) runs from `xterm.js` callbacks,
which are outside React's render cycle, so it can't rely on a state variable
captured in a closure — it'll be stale. That's why `IdeShell.tsx` keeps a
`vfsSnapshotRef` in sync every render purely for synchronous reads. All
*writes*, from anywhere, still go through React's functional `setState` so
they can never race or clobber each other. If you add a new mutation to
`VfsBridge`, follow that same pattern — don't read `files`/`tree` state
directly from a non-React callback.

## Gotchas already hit (don't rediscover these)

1. **Monaco via CDN doesn't load.** The environment blocks the default
   jsdelivr loader. Monaco is self-hosted from `public/monaco-editor` (copied
   by `scripts/copy-monaco.js`); the loader is pointed at that local path.
2. **`FitAddon.fit()` on first mount measures garbage.** xterm hasn't painted
   yet, so `fit()` computes a 1-column terminal. `TerminalPanel.tsx` has a
   `safeFit()` guard: defer with a double `requestAnimationFrame`, and sanity-
   check `proposeDimensions()` against `MIN_COLS=10, MIN_ROWS=3` before
   applying. If terminals ever start rendering as a single garbled column
   again, this is the first place to look.
3. **`h-full` doesn't propagate through a long flex-ancestor chain reliably.**
   `IdeShell`'s root uses `h-dvh` (viewport-relative), not `h-full`, for
   exactly this reason. If a panel mysteriously collapses to zero height after
   a layout refactor, suspect a percentage-height chain, not the new code.
4. **Tailwind v4's content scanner skips plain `.ts` files by default** (only
   `.tsx`). Every color class defined as a *string* in `palette.ts` — not
   written literally in a `.tsx` file — silently never made it into the
   compiled CSS until an explicit `@source "../lib/**/*.ts";` was added to
   `globals.css`. If you add new Tailwind classes as strings in a `.ts` file
   under `lib/ide/` and they don't apply, this is why — check that the
   `@source` glob actually covers the new file.
5. **CSS cascade layers: unlayered rules beat layered ones, always**, no
   matter specificity. `globals.css` had a plain `body { color: var(...) }`
   outside any `@layer`, which silently overrode every Tailwind utility class
   applied to text anywhere in the IDE. Keep base/reset rules inside
   `@layer base` in this file, not floating unlayered.
6. **Pyodide must be loaded via an injected `<script>` tag, not `import`.**
   The `pyodide` npm package has a Node-only `ws` dependency that breaks
   Turbopack/webpack if you try to `import` it directly. `pyodide-runtime.ts`
   injects `/pyodide/pyodide.js` as a script and calls the resulting
   `window.loadPyodide(...)`. Don't "clean this up" into a normal import.
7. **Root `.gitignore` had (has, if it regresses) an unanchored `lib/`
   rule** meant for Python's `build/lib/`. Unanchored, it also matches
   `candidate/frontend/src/lib/`. It's fixed (`/lib/`, `/lib64/`), but if you
   ever see files under `lib/ide/` that `git status` doesn't mention after
   adding them, check `git check-ignore -v <path>` before assuming you forgot
   to `git add`.
8. **`.xterm-viewport`'s background is hardcoded `#000` in xterm's bundled
   CSS**, and the DOM renderer never overrides it with an inline style from
   `theme.background` — that option is silently ignored for this element. It
   went unnoticed while the dark theme's background was close enough to black
   to look right by accident; switching to a light theme made it obvious (a
   solid black terminal regardless of theme). Fixed by setting
   `.xterm-viewport`'s `style.backgroundColor` directly (`paintViewport()` in
   `TerminalPanel.tsx`), both on creation and on every theme change — an
   inline style beats the class rule. If the terminal ever looks like it's
   ignoring `xtermTheme` again, check that this is still being called.
9. **Testing the terminal via browser automation:** xterm's hidden
   `.xterm-helper-textarea` doesn't reliably receive synthetic CDP `Return`/
   `Enter` keypresses. Dispatching a raw `KeyboardEvent('keydown', {key:
   "Enter", ...})` on that element works — but calling `.focus()` on it
   immediately beforehand (when it's already focused) desyncs xterm's internal
   input diffing and silently swallows all subsequent typed input. Don't add a
   redundant `.focus()` before dispatching if the element is already focused.

## Layout model: floating rounded cards, not flush VS Code panels

`IdeShell.tsx` renders Explorer / Editor+Breadcrumbs / Terminal / status bar as
independent `rounded-xl border overflow-hidden` cards on a `palette.panelBg`
canvas, with `p-2 gap-2` spacing — not VS Code's original edge-to-edge flush
layout. The `overflow-hidden` on each card is load-bearing: it's what clips
that panel's own sharp-cornered internal content (Monaco, xterm, the file
tree) down to the card's rounded shape, so **any new top-level panel added
here needs the same `rounded-xl border overflow-hidden` wrapper**, or its
content will render as a sharp rectangle poking out of an otherwise rounded
layout. The resize-drag handles live in the gap between cards now (small
rounded-pill grips), not as a bordered divider between two flush panels.

## Testing the terminal's line editor (Tab, arrows, Ctrl shortcuts)

Beyond gotcha #9 above: this browser-automation harness's synthetic input is
flaky for `vfs-shell.ts`'s line editor specifically, in two independent ways —
budget verification time accordingly and don't over-trust a single failed
attempt as a real bug:
- **`computer.type` poisons the terminal.** CDP `insertText` sets
  `.xterm-helper-textarea`'s `value` *without* the events xterm consumes, so
  the text sits there unread — and because a non-empty textarea looks like an
  in-progress IME composition, xterm then ignores **all** further input,
  including Enter. That is the cause of every "the terminal went dead"
  episode here; it is not an app bug. Once it happens, only a page reload
  recovers that instance.
- Synthetic `keypress` is the input that works, but `charCode`/`which` are
  read-only and the constructor ignores them, so they must be attached with
  `Object.defineProperty` — xterm bails when both read 0. It also needs
  genuine focus first (a real click), and it renders a frame or two later
  than you'd expect, so sample after a delay before concluding it failed.
- `computer.key "Tab"` reliably loses focus to the next focusable element
  (the browser's default focus-navigation wins the race) instead of reaching
  xterm's `keydown` handler — same category as the Enter-key issue in gotcha
  #9. The workaround is the same: dispatch a real `KeyboardEvent('keydown',
  {key: "Tab", ...})` directly on `.xterm-helper-textarea` via JS. Mixing a
  failed `computer.key "Tab"` attempt with a follow-up JS dispatch in the
  *same* session was observed to occasionally double-process the keystroke
  (e.g. a completion appearing to also execute) — when testing this, use only
  one input method per keystroke, and prefer a fresh tab if state ever looks
  inconsistent, rather than trying to layer a workaround on top of a call
  that may have partially gone through.

## The shell engine (`lib/ide/shell/`)

`vfs-shell.ts` is only the line editor now. Execution lives in
`lib/ide/shell/`: `parser.ts` → `execute.ts` → `registry.ts` → `commands/*`.

**A command is a function returning `{stdout, stderr, code}` — it must not
write to the terminal.** That's the whole reason pipes work; a command that
reaches for `ctx.io.write` puts its output *outside* the pipeline, where the
next command can't see it. `ctx.io` exists only for live progress on
long-running commands, and even then only when `ctx.isTerminalSink` is true
(the isatty equivalent: false when stdout goes into a pipe or a file, which
is also why `ls` only colorizes for a real terminal).

Adding a command: write it in the right `commands/*.ts` file, register it in
`registry.ts` (that's also what Tab-completion and `which` read), and return
a real exit code — `&&`/`||` branch on it, so getting it wrong silently
breaks chaining for everyone.

**Gotcha that bit once, and will again:** VFS mutations queue a React
`setState`, but a whole command line runs in a single tick. `IdeShell`'s
`syncSnapshot` therefore updates the snapshot ref *synchronously* inside each
mutator — without that, `echo hi > a.txt && cat a.txt` reads a filesystem
that doesn't contain `a.txt` yet, and repeated writes create duplicate tree
nodes because `findNode` can't see the first one. Any new VFS mutator must
call `syncSnapshot` too.

The engine is deliberately free of DOM/React imports, so it can be driven
directly against an in-memory `VfsBridge` in Node — far more reliable than
testing through xterm (see the automation caveats below).

## Two storage rules that are easy to get wrong

1. **Git objects must never go into the VFS.** They're compressed binary; the
   VFS is `Record<string, string>`. `lib/ide/git/hybrid-fs.ts` routes
   `/.git/**` to IndexedDB and everything else to the VFS — keep that split.
   isomorphic-git also passes *bare relative paths* (`lstat(".")`), so the
   path normalizer has to resolve `.`/`..`, not just prefix a slash.
2. **Pyodide ships no wheels.** The npm package contains the runtime only —
   not even micropip. `indexURL` therefore can't serve packages, and
   `packageBaseUrl` must point at the CDN or `pip install` breaks entirely
   with a confusing "Failed to fetch". The version is read from
   `pyodide/package.json` so it survives upgrades; don't hardcode it.

## Testing this feature (learn from the time already lost here)

Drive the shell engine **in Node**, not through xterm. It has no DOM/React
imports, so a harness can build an in-memory `VfsBridge` and call
`executeCommandLine` directly — that's how the 30-case shell suite and the
18-case git suite run (git needs ~40 lines of fake IndexedDB). Node 22 runs
the TS directly with `--experimental-strip-types` plus a resolver hook that
appends `.ts` (the source uses bundler-style extensionless imports).

Only genuinely browser-dependent things (Pyodide/pip, the npm registry, the
cleanup dialog) need the browser, and those are best driven by calling the
APIs from the page rather than typing into the terminal — see the xterm
caveats below.

## Conventions to keep

- **Real execution or an honest failure — never a fake success.** JS, TS, and
  Python genuinely run (TS via the real `typescript` compiler — see
  `runTypeScript` in `code-runner.ts` — not a fake pass-through). Every other
  "supported" language in `FileTypeIcon.tsx`
  is icon-only; running one should print a real `command not found`, not a
  canned "Ran successfully" message. If you add another real interpreter
  (a WASM Ruby/Lua runtime, say), wire it through `code-runner.ts` the same
  way Python is, and update `spec.md` §4.4 and `task.md`.
- **Real assets, not approximations.** File icons come from `devicon`
  (MIT-licensed), Monaco and Pyodide are the real upstream builds,
  self-hosted. Don't hand-draw a lookalike icon when a real one exists.
- **The VFS is virtual and local-only, on purpose.** Don't wire this feature
  to `candidate/backend` or any network call without a deliberate decision to
  change the spec — right now "it's all in this tab's `localStorage`" is a
  documented, intentional property, not a gap.
- **Auto Save is on by default and has no toggle** (see
  [issue #7](https://github.com/RishiGoswami-code/Mindfries/issues/7)). If you
  build a settings panel, that's the first setting to add.

## Before shipping a change here

- `npm run lint` and `npm run build` (production, Turbopack) both clean.
- Manually smoke-test in a real browser, not just a code read — this feature
  has repeatedly had bugs (dimension races, cascade-layer overrides, a silent
  `.gitignore` exclusion) that only showed up by actually running it:
  1. Create/rename/delete a file and a folder in the Explorer.
  2. Run a `.py` and a `.js` file from the terminal; open two terminal tabs.
  3. Open a `.ipynb`, add two code cells that share a variable, run both.
  4. Toggle the theme; check the logo, status bar, and terminal prompt color
     in both modes.
  5. Refresh the page; confirm the workspace comes back exactly as left.

## Where things live

| Concern | File(s) |
|---|---|
| Top-level state / composition | `components/ide/IdeShell.tsx` |
| VFS contract | `lib/ide/vfs-bridge.ts`, `tree.ts`, `vfs-path.ts` |
| Terminal shell | `components/ide/vfs-shell.ts` |
| Terminal UI (multi-session) | `components/ide/TerminalGroup.tsx`, `TerminalPanel.tsx` |
| Code execution | `lib/ide/code-runner.ts`, `pyodide-runtime.ts` |
| Notebooks | `lib/ide/notebook.ts`, `components/ide/NotebookEditor.tsx`, `tiny-markdown.tsx` |
| File icons | `components/ide/FileTypeIcon.tsx`, `scripts/copy-file-icons.js` |
| Theme/branding | `lib/ide/palette.ts`, `theme.tsx`, `public/mindfries-logo.svg` |
| Persistence | `lib/ide/fs-persist.ts` |
