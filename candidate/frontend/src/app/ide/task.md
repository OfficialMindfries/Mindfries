# In-Browser Workspace IDE — Task Log

Status log for the work under `src/{app/ide,components/ide,lib/ide}`. See
[spec.md](spec.md) for what each item actually does.

## Phase 1 — Shell & layout
- [x] `IdeShell.tsx` as single source of truth (tree, files, open tabs, active tab)
- [x] Explorer / Editor / Bottom panel layout, resizable Explorer width
- [x] Problems / Output / Debug Console / Terminal / Ports tab strip in `BottomPanel`
- [x] Removed the side activity-bar panel (dead code `ActivityBar.tsx`,
      `SearchPanel.tsx`, `PlaceholderSidebar.tsx` deleted)
- [x] Removed the top header bar; theme toggle moved into `StatusBar`

## Phase 2 — Virtual filesystem & Explorer
- [x] `VfsBridge` interface (`getSnapshot`, `createFile`, `createFolder`,
      `remove`, `write`, `move`) shared by Explorer/Editor/Terminal
- [x] Tree transforms in `lib/ide/tree.ts` (`addNode`, `removeNode`,
      `renameNode`, `moveNode`, `collectFilePaths`, `findNode`, `siblingNames`)
- [x] Path resolution utilities (`.`/`..`/absolute) in `lib/ide/vfs-path.ts`
- [x] Create/rename/delete files & folders inline in the Explorer
- [x] Started empty — all hardcoded sample files removed from `mock-project.ts`

## Phase 3 — Editor
- [x] Monaco self-hosted (`scripts/copy-monaco.js` → `public/monaco-editor`),
      loader pointed at the local path (CDN loading is blocked in the sandbox)
- [x] Tabs with dirty-state dot, Ctrl/Cmd+S
- [x] `lib/ide/language.ts` — extension → Monaco language id mapping

## Phase 4 — Terminal: a real shell over the VFS
- [x] Replaced the mock/canned-response shell (`shell.ts`, deleted) with
      `vfs-shell.ts`: real `ls/cd/pwd/cat/touch/mkdir/rm/mv/cp/echo` against the
      shared VFS, real error messages, per-session `cwd`
- [x] `mv` supports moving across directories, not just same-directory rename
- [x] Multiple terminal sessions as left-aligned tabs (not a dropdown), `+`
      button directly after the last tab, compact sizing
- [x] Fixed `FitAddon.fit()` measuring bogus dimensions before first paint
      (`safeFit()` guard, double-`requestAnimationFrame` defer)
- [x] Removed the "Loading Python runtime..." message and the old
      "Mindfries workspace terminal..." banner; replaced with a one-liner
      ("Linux commands are supported.")

## Phase 5 — Real code execution
- [x] `lib/ide/code-runner.ts`: `runJavaScript` (`new Function`, captured
      console output) and `runPython` (Pyodide)
- [x] `lib/ide/pyodide-runtime.ts`: singleton Pyodide loader, `<script>`-tag
      injection (not `import`), lazy-loaded on first Python run
- [x] `scripts/copy-pyodide.js`, wired into `postinstall` and `build`
- [x] Verified live: variable set in one terminal `python` run is not expected
      to persist across separate script runs by design, but **does** persist
      across notebook cells and repeated `python` invocations in the same tab
      (shared singleton kernel)

## Phase 6 — File-type icons
- [x] Replaced letter-abbreviation icons with real brand SVGs from `devicon`
      (fixed the Python/HTML-same-icon bug)
- [x] `scripts/copy-file-icons.js` — ~40 SVGs copied into `public/file-icons/`
- [x] `FileTypeIcon.tsx` — ~65 extension/filename mappings

## Phase 7 — Branding & theming
- [x] Mindfries logo converted from the supplied JPG to a traced SVG
      (`potrace`, 16× upscale before tracing) — renders correctly in both themes
- [x] Logo added to the Explorer header before "EXPLORER", and as the favicon
- [x] Accent color and status bar recolored to brand purple (`#7957da`)
- [x] Terminal prompt ("mindfries") recolored to the same purple via 24-bit
      ANSI true-color codes
- [x] Theme toggle moved to the status bar, icon-only (moon/sun)
- [x] Fixed a CSS cascade-layers bug where an unlayered `body { color }` rule
      in `globals.css` beat every layered Tailwind utility class
- [x] Fixed Tailwind v4 not content-scanning plain `.ts` files (only `.tsx`),
      which had silently dropped every class string defined in `palette.ts`
      from the compiled CSS — fixed with an explicit `@source` directive

## Phase 8 — Jupyter notebooks
- [x] `.ipynb` support: `lib/ide/notebook.ts` (nbformat v4 parse/serialize,
      scoped to code+markdown cells, text-only output)
- [x] `NotebookEditor.tsx`: Run All / + Code / + Markdown, per-cell Play/Delete,
      auto-resizing cell textareas, Ctrl/Cmd+S handled independently of Monaco
- [x] `tiny-markdown.tsx`: minimal Markdown renderer for markdown cells
- [x] Verified kernel-state sharing across cells live (variable set in cell 1
      readable in cell 2)
- [x] Jupyter logo used for the `.ipynb` file icon

## Phase 9 — Persistence
- [x] `lib/ide/fs-persist.ts`: debounced `localStorage` save + restore-on-mount
      (`mindfries-ide-workspace` key)
- [x] Auto Save on by default (~800ms debounce after edits stop)
- [x] Verified: created a file, confirmed it in `localStorage`, refreshed,
      confirmed it came back

## Phase 10 — Repo hygiene
- [x] Found and fixed a repo-root `.gitignore` bug: the unanchored `lib/`
      pattern (meant for a Python `build/lib/` artifact) was matching
      `candidate/frontend/src/lib/` anywhere in the tree and silently keeping
      13 real source files out of git. Anchored to `/lib/`, `/lib64/`.
      (commit `98f034b`)
- [x] Deleted dead code left over from earlier iterations (`ActivityBar.tsx`,
      `SearchPanel.tsx`, `PlaceholderSidebar.tsx`, old `shell.ts`,
      `ThemeToggle.tsx`)
- [x] Committed the full feature, wrote [pr.md](/pr.md), opened
      [PR #3](https://github.com/RishiGoswami-code/Mindfries/pull/3)
- [x] Recovered from a git ref corruption caused by a mid-session power loss
      (`refs/heads/candidate/ide-workspace` was zero-filled; repaired via
      `git update-ref` once the commit object was confirmed intact)

## Phase 11 — Rebrand to the navy/blue palette
- [x] Replaced the purple brand palette (`#7957da`/`#a78bfa`) with the five-swatch
      navy/blue palette (`#0A1931`, `#1A3D63`, `#4A7FA7`, `#B3CFE5`, `#F6FAFD`)
      across `palette.ts` (both dark and light token sets), the status bar
      (`STATUS_BAR_BG`), the terminal prompt (`vfs-shell.ts`), the terminal's
      xterm theme, the light-flash paint color (`theme.tsx`), the file-icon
      fallback glyph, and the logo/favicon SVGs
- [x] Found and fixed a real bug while verifying the recolor: xterm's bundled
      CSS hardcodes `.xterm-viewport { background-color: #000 }`, and the DOM
      renderer never overrides it with `theme.background` — the terminal had
      *always* rendered on a plain black viewport, just invisibly so while the
      dark theme's background was close enough to black to hide it. Fixed by
      painting `.xterm-viewport`'s inline style directly
      (see [claude.md](claude.md), gotcha #8)

## Phase 12 — Rounded floating-card layout
- [x] Replaced VS Code's flush, edge-to-edge panel layout with independent
      rounded cards (Explorer, Editor+Breadcrumbs, Terminal, status bar)
      floating on a recessed canvas — `p-2 gap-2` on the root, each panel
      wrapped in `rounded-xl border overflow-hidden` (the `overflow-hidden`
      clips each panel's own sharp-cornered content to the card's rounded
      shape) in [IdeShell.tsx](../../components/ide/IdeShell.tsx)
- [x] Resize-drag handles (sidebar/terminal splitters) moved into the gap
      between cards, restyled as small rounded-pill grips instead of a
      1px border-divider
- [x] Active editor and terminal-session tabs bumped from `rounded-t-[4px]`
      to `rounded-t-lg` to match the new card radius

## Phase 13 — Real line editing in the terminal
- [x] Tab-completion in `vfs-shell.ts`: completes command names on the first
      word, file/folder paths (relative to cwd) elsewhere — single
      unambiguous match completes inline (directories get a trailing `/`,
      files get a trailing space), multiple matches complete their longest
      common prefix and print the candidate list, same as bash/zsh
- [x] Full line editing to match a real terminal: cursor tracking with
      Left/Right (and Ctrl+B/F), Home/End (and Ctrl+A/E), Delete key,
      Ctrl+U/K (kill to start/end of line), Ctrl+W (delete previous word),
      Ctrl+C (cancel line), Ctrl+L (clear screen, keep the line) — all
      rendering through one `redraw()` helper instead of ad hoc cursor math
- [x] Cursor style switched from the default solid block to a thin `bar`
      (`cursorStyle: "bar"`, `cursorWidth: 1`) in `TerminalPanel.tsx`

## Phase 14 — Real TypeScript execution
- [x] `runTypeScript` in `code-runner.ts`: transpiles with the real
      `typescript` compiler (`ts.transpileModule`, dynamically imported —
      moved `typescript` from devDependencies to dependencies since it's now
      a genuine runtime dependency of the client bundle, not just a
      build-time type checker), then runs the emitted JS through the
      existing `runJavaScript`
- [x] `node` (plus new `ts-node`/`tsx` aliases) in `vfs-shell.ts` auto-detects
      `.ts`/`.tsx` and transpiles first — no separate command or install
      step needed, matching how `python` needs none either
- [x] Verified live: a `.ts` file with a real type annotation
      (`(name: string): string`) ran via `node hello.ts` and printed the
      correct output, confirming the annotation was actually stripped and
      the result actually executed (not just displayed)

## Phase 15 — Real shell: parser, pipelines, package managers

Architecture decision: commands moved out of a `switch` that wrote straight to
xterm, into functions returning `{stdout, stderr, code}` behind a registry
(`lib/ide/shell/`). Writing to the terminal from inside a command makes pipes
structurally impossible — this refactor is what unlocked everything below,
and it made the engine testable without a browser.

- [x] `parser.ts` — tokenizer with real quoting rules (`'literal'` /
      `"expanded"` / `\escaped`), parsed into pipelines joined by `&&`/`||`/`;`
      with `>`/`>>`/`<`/`2>` redirects
- [x] `execute.ts` — pipes stdin→stdout between commands, applies redirects,
      short-circuits on real exit codes, expands `$VAR`/`${VAR}`/`$?`/`~`
- [x] Glob expansion (`*.ts`, `src/*`, `?`), unmatched patterns left literal
      like bash's default
- [x] Unix toolbelt: `grep -i -n -v -c -r`, `sed s///`, `find -name -type`,
      `head`, `tail`, `wc`, `sort -n -r -u`, `uniq -c -d`, `cut`, `tr`,
      `diff`, `tree`, plus `ls -l -a -1`, `rm -f`, and **`cp -r`** — which
      closes [issue #5](https://github.com/RishiGoswami-code/Mindfries/issues/5)
- [x] Shell builtins: `export`, `env`, `unset`, `alias`, `unalias`, `which`,
      `history`, `uname`
- [x] `curl`/`wget` — real `fetch()`, with an honest CORS-limit message
      rather than a vague failure
- [x] `pip install/list/show` via micropip (real PyPI + Pyodide index)
- [x] `npm install/list/uninstall` via the real npm registry + esm.sh, with a
      persisted manifest; the JS/TS runner now executes module code as a real
      ES module (blob URL) with bare imports rewritten to the installed version
- [x] **Fixed a real bug the refactor exposed**: VFS mutations went through
      React `setState`, and the synchronous snapshot ref only refreshed on
      the *next render* — so with multiple commands per line
      (`echo hi > a.txt && cat a.txt`), every command after the first read a
      stale filesystem, and repeated writes even created duplicate tree
      nodes. Mutators now update the ref synchronously before queuing the
      React update (`syncSnapshot` in `IdeShell.tsx`)
- [x] Verified with a 30-case harness driving the real engine against an
      in-memory VFS (pipes, redirects, chaining, globs, exit codes, quoting,
      `cp -r`, `sort | uniq -c`, aliases) — 30/30 — plus live browser checks
      of `npm install left-pad` and importing it in a script (`[00007]`)

## Phase 16 — Real git (hybrid storage) + package cleanup on close

- [x] `lib/ide/git/idb.ts` — binary-safe IndexedDB key/value store
- [x] `lib/ide/git/hybrid-fs.ts` — the fs adapter isomorphic-git talks to:
      `/.git/**` → IndexedDB (git objects are compressed binary and would be
      corrupted by our text-only VFS), everything else → the VFS, so the
      working tree stays the files the user can see and edit
- [x] `git init/add/status/commit/log/branch/checkout/rm/config` via
      isomorphic-git — real SHA-1 objects, a real commit graph. `clone`/`push`/
      `pull` refuse honestly (they need a CORS proxy or the backend executor)
- [x] **Fixed:** isomorphic-git passes bare relative paths (it calls
      `lstat(".")` while walking the tree), which a naive "prefix a slash"
      normalizer turned into `/.` — every status/checkout failed ENOENT
- [x] **Fixed a bug that made `pip install` impossible for everyone:** the
      pyodide npm package ships the runtime but *zero* wheels — not even
      micropip. With `indexURL` pointed at our self-hosted copy, every
      `loadPackage()` 404'd against our own server ("Failed to fetch"). Now
      `packageBaseUrl` points at the official CDN for exactly the version we
      ship (version read from `pyodide/package.json`, so it tracks upgrades),
      while the runtime itself stays self-hosted
- [x] `pip` now surfaces the *useful* line of micropip's error rather than
      its trailing "use keep_going=True" hint
- [x] `PackageCleanupGuard.tsx` — asks whether to delete downloaded packages
      when leaving, with "Yes, delete" / "Don't delete" / "Cancel closing
      window". Only arms when packages actually exist. See the note in that
      file on why the three buttons can't live in the browser's own close
      prompt (pages can't customize it — that restriction stops tab-trapping)

### Verified
- Shell engine: **30/30** automated cases against the real parser/executor
- Git: **18/18** automated cases against real isomorphic-git + the hybrid fs,
  including "objects went to IndexedDB, not the VFS"
- pip: live in-browser — installed `attrs` 26.1.0 from PyPI, imported it, and
  built a real `@attrs.define` object; `tensorflow` fails with micropip's own
  honest "no pure Python 3 wheel" error
- npm: live end-to-end — `npm install left-pad` → `+ left-pad@1.3.0`, then
  importing it in a script printed `[00007]`
- Cleanup dialog: live — deletes / keeps / dismisses correctly, and stays
  silent when nothing is installed
- `next build` (production) and `eslint` clean

## Phase 17 — Visible installs, and pasting multiple commands

- [x] `npm install` now mirrors each package into
      `node_modules/<name>/package.json` (real registry metadata plus npm's
      own `_from`/`_resolved` fields), so an install is something you can see
      in the Explorer instead of an invisible entry in browser storage.
      Scoped names nest correctly; `npm uninstall` and the cleanup dialog
      both remove the directory again
- [x] `npm create` / `npm init` / `npm run` / `npx` explain that they run a
      package's Node CLI and there's no Node process in a browser, instead of
      a bare `unknown command` that reads like a typo. Deliberately *not*
      faked with hardcoded templates
- [x] **Fixed: pasting multiple commands did nothing.** xterm delivers a
      paste as ONE `onData` chunk with newlines normalized to `\r`. It
      matched no key handler and fell through to the plain-text branch, so
      the whole block landed on a single line with literal control
      characters embedded. Chunks with line breaks are now split
      (`lib/ide/shell/paste.ts`) and run in order, each echoed after its own
      prompt. A trailing newline decides whether the final line runs or waits
      on the prompt — matching bash/zsh. A bare `\n` now works as Enter too

### Verified
- 15/15 paste cases: `\r` / `\n` / CRLF, trailing break vs not, pasting into
  already-typed text, pasting mid-line (splices at the cursor), blank lines,
  and *not* misfiring on arrow-key escape sequences — plus a real pasted
  block (`mkdir demo ; cd demo ; touch a.txt b.txt ; ls ; pwd`) run through
  the engine, asserting both the output and that the filesystem changed
- 11/12 npm cases (the one failure is the harness, not the app: module
  execution uses `Blob` URLs, which Node's ESM loader rejects and browsers
  accept). `react` verified loading and running live in-browser, and
  `node_modules/react` + `react-dom` verified rendering in the Explorer

## Phase 18 — Scaffold a project, and actually run it

The honest error from Phase 17 explained why `npm create vite` couldn't work,
but an IDE you can't start a project in isn't much of an IDE. Both halves are
now real.

- [x] `npm create vite@latest <name> -- --template <t>` fetches the **real**
      `create-vite` template from jsDelivr and writes it into the workspace —
      the same files the real CLI copies, including the `_gitignore` →
      `.gitignore` rename and setting the project name in `package.json`
      (`lib/ide/scaffold.ts`). Binary assets can't live in a text filesystem,
      so they're skipped *and reported*
- [x] `dev` builds and opens a live preview (`lib/ide/preview/build-preview.ts`
      + `PreviewPanel.tsx`). Vite's dev server is a Node process and can't
      come along, but a bundler isn't what makes React run — the browser is.
      JSX goes through the real TypeScript compiler, relative imports resolve
      to the user's own modules, bare imports to installed packages. CSS
      imports inject a `<style>`, imported SVGs become data URIs, unresolved
      assets warn instead of taking the page down
- [x] Commands reach the UI through a new `ShellIO.openPreview` — the same
      effect channel `write`/`clear` already use, rather than a second
      mechanism

### The sandbox bug worth remembering
`sandbox="allow-scripts"` alone gives the iframe an **opaque origin, which
silently refuses to load `blob:` URLs created by the parent** — the preview
came up blank with no error anywhere in the parent. `allow-same-origin` is
therefore load-bearing, not decoration. The trade-off (previewed code can
reach this origin's storage) matches the boundary the IDE already works to:
`node app.js` runs user code in the page itself, so an iframe with its own
document is more contained, not less.

### Verified
- 14/14: real template fetched and written, `package.json` renamed,
  `.gitignore` renamed, existing directory refused, preview built, JSX
  transpiled, bare imports → CDN, relative imports → blob modules
- React rendering live in the sandboxed iframe, confirmed side by side
  against the broken opaque-origin variant

### Not covered
The full click-through inside the IDE (type `dev`, watch the panel open)
wasn't completed — the terminal input automation kept dropping keystrokes.
Each piece is verified independently; the wiring between them is prop
passing that typechecks. Worth one manual run.

## Phase 19 — `npm run dev`, live rebuilds, preview sidebar

- [x] `npm run <script>` reads the project's **real** package.json scripts. A
      dev-server script (`vite`, `vite dev`, `next dev`…) opens the live
      preview, since that's the same outcome; `build`/`lint`/`test` refuse and
      name the actual script command they'd have run
- [x] The preview stays live: the IDE watches the workspace and rebuilds the
      watched project ~400ms after edits stop, so it behaves like a dev server
      rather than a one-shot snapshot. A build that fails mid-edit keeps the
      last good render instead of blanking
- [x] Preview moved to its own **resizable right sidebar**, so code and the
      running app are visible together (it used to take over the editor)
- [x] Each build's blob URLs are tracked and the previous set is revoked on
      rebuild — otherwise a long editing session leaks a module's worth of
      memory per rebuild

### Fixed while testing
`vite build` was being treated as a dev server. The script pattern only
anchored the start, so `vite` matched the prefix of `vite build`; it's now
anchored at both ends (flags aside). A build is not a dev server.

### Verified
9/9: `npm run dev` works and echoes the real script, opens the preview and
reports the watched root; `npm run build` refuses honestly naming
`vite build`; a missing script lists the real ones; `npm run` outside a
project reports no package.json; an edit produces a genuinely different
bundle; each build tracks its own object URLs for release.

### Not covered
The sidebar rendering itself wasn't visually confirmed — terminal input
automation kept dropping keystrokes, so `npm run dev` couldn't be driven
through the real UI. The build pipeline, the watcher and React-in-the-iframe
are each verified; the layout is ordinary resizable-panel markup that
compiles and lints.

## Phase 20 — `npm run dev` runs like a real dev server

It printed "ready" and handed the prompt straight back, which no dev server
does. It now holds the terminal until interrupted.

- [x] **Long-running foreground commands.** `CommandContext` gained a
      `signal: AbortSignal`; `dev` waits on it instead of returning, so the
      terminal stays occupied the way a real process would. (Need another
      shell meanwhile? Open a second terminal tab — they're independent.)
- [x] **Ctrl+C actually interrupts.** It's now checked *before* the `busy`
      guard in `vfs-shell.ts` — previously the guard swallowed it, so a
      running command couldn't be stopped at all. It aborts the controller;
      the command then unsubscribes, stops the watcher and returns.
- [x] **Rebuilds stream into the terminal** (`rebuilt in 42ms`, or the error
      when a build fails) via `PreviewController.onRebuild`, replacing the
      single `onPreview` callback with a small controller the shell can talk
      to properly
- [x] Stopping leaves the panel up with the last good build, marked
      **stopped** rather than **live** — killing a dev server doesn't erase
      the page you already had
- [x] Redirected or piped (`npm run dev > log.txt`) it stays one-shot, since
      there's nobody to press Ctrl+C — it would otherwise hang forever

### Verified
10/10: the dev server doesn't resolve on its own, announces watching, says
how to stop, registers a log subscriber, streams rebuild lines, ends on
Ctrl+C, reports stopping, tells the IDE to stop watching, unsubscribes, and
stays one-shot when redirected.

## Phase 21 — Preview moves inside the terminal panel

- [x] The preview is no longer a full-height column beside the editor. It now
      sits **inside the terminal panel**, to the right of the terminals and
      below the kill button — a wide landscape strip, which suits a running
      page better than a tall narrow one
- [x] Resizable divider between the terminals and the preview, so either side
      can take the space
- [x] `PreviewController` state (`html`/`title`/`watching`) is threaded down
      to `TerminalGroup`, which owns the split; `IdeShell` still owns the
      state and the rebuild watcher

Note this **replaced** the right sidebar rather than adding a second copy of
the same preview — trivial to move back if the full-height column is wanted
for wider screens.

### Not covered
Same gap as Phases 19–20: the terminal input automation drops keystrokes, so
`npm run dev` couldn't be driven through the real UI to photograph the new
split. It's layout-only JSX (a flex row plus the existing resizable hook)
that compiles, lints and builds; every piece it renders was verified earlier.

## Phase 22 — Bare `npm install`, camera panel, sidebar footer

- [x] **`npm install` with no arguments** reads the project's real
      `package.json` and installs its `dependencies`. `devDependencies` are
      skipped with a line saying why — they're build tooling (vite, plugins,
      linters) that resolves fine but does nothing without a Node process, so
      installing them would be inert weight
- [x] **Fixed: `node_modules` ignored the current directory.** Installs always
      wrote to the workspace root, so running `npm install` inside `my-app`
      put nothing in `my-app` — which is exactly the "I didn't see
      node_modules in the dir" report. It's now relative to the shell's cwd,
      like real npm
- [x] **Camera panel** in the terminal's right area, toggled from the video
      icon beside the kill button. The camera is only requested when Start is
      pressed — never on mount, never automatically after a reload — and the
      stream is released on stop and on unmount, so the capture light doesn't
      stay on. Permission denied / no camera / camera busy are reported
      distinctly instead of showing a blank rectangle. Nothing is recorded or
      transmitted; the stream is attached to a local `<video>` only
- [x] **Explorer footer**: an AI help button and the signed-in candidate
      (Rishi). AI help currently opens a note explaining it needs an API key
      and a backend route — a button that looked wired up but silently did
      nothing seemed worse than one that says what's missing

### Verified
7/7: bare install with no package.json explains itself; it reads
dependencies from package.json; it skips devDependencies and says why;
`node_modules` is created inside the project; no stray one at the workspace
root; the packages are inside it; each gets a real `package.json`.

## Phase 23 — AI help chat panel (interface only)

- [x] `ChatPanel.tsx`: message history, chat bubbles, auto-scroll to the
      newest message, Enter to send / Shift+Enter for a newline, send
      disabled while the draft is empty
- [x] Opens as a resizable full-height column on the right, toggled by the
      AI help button in the Explorer footer (which highlights while open)
- [x] **No model behind it, and it says so.** Rather than inventing
      plausible-looking answers, the assistant turn states plainly that
      nothing is connected. Wiring it up is replacing `respondTo` with a real
      request — history, layout and input already work

### Verified
Live in the browser: the button opens the panel, a typed question renders as
a user bubble, and the assistant bubble returns the not-connected reply.

## Phase 24 — Camera-proctored session

The camera is now required for the whole session, with no off switch.

- [x] `useProctorCamera` owns the stream above the panel that shows it, so
      the feed survives layout changes and can't be detached by re-rendering
- [x] `ProctorGate` blocks the entire workspace until the stream is live, and
      **re-blocks** if it ever stops
- [x] `CameraPanel` has no start/stop/close control and is always mounted,
      with a steady "recording" indicator
- [x] Distinct handling for blocked permission, no camera, and camera in use
      by another app — each with the actual fix, not a generic failure

### Two deliberate limits
1. **Browser revocation can't be prevented, and isn't fought.** Permission can
   always be withdrawn from site settings or the tab's camera control. When
   that happens the track fires `ended`, and the IDE locks rather than
   pretending it's still monitoring. Detecting via `ended` beats polling
   permissions: it also covers unplugging and OS suspend.
2. **The candidate is told before the prompt, not after.** The gate states
   the session is proctored and that video stays on screen throughout.
   Turning the camera on silently would have been the wrong build.

### Verified
Live in the browser: the gate blocks the workspace on load, the camera panel
is permanently mounted with no off control, and a blocked permission shows
the right message with a working retry while the workspace stays locked.

**Not verified here:** the live path and mid-session revocation — the Browser
pane blocks camera access outright, so no stream can be obtained in this
environment. Both need a manual check with a real camera.

## Phase 25 — Floating launcher for the AI agents

- [x] Removed the **AI help** row from the Explorer footer; only the
      signed-in candidate remains there
- [x] `ChatLauncher.tsx`: a floating 48px circle at the bottom right carrying
      the Mindfries logo, with a status dot sat on the circle's outline
      (ringed in the surrounding colour so it reads as attached to the edge,
      not floating over it)
- [x] Clicking it opens the AI agents panel; the launcher hides while the
      panel is open, since the panel has its own close and the bubble would
      otherwise sit on top of what it opened
- [x] It sits above the status bar and beneath the proctor gate, so a locked
      session can't be bypassed by opening chat

### Verified
Live: 48×48 at 16px from the right, logo loads, the dot measures 12px on the
circle's outline at bottom-right (offset 17,17 from centre against a 24px
radius), clicking opens the chat and hides the launcher.

## Phase 26 — Camera visible on every bottom-panel tab

- [x] The camera lived inside `TerminalGroup`, so it only appeared on the
      Terminal tab — switching to Problems/Output/Debug/Ports hid the feed
      mid-session, which defeats the point of a proctored workspace
- [x] Moved up to `BottomPanel`, beside the tab-content area rather than
      inside it. It now renders on all five tabs
- [x] **Mounted outside the tab switch**, so the `<video>` element is never
      torn down. That's what makes it uninterrupted rather than merely
      re-shown: a remount would re-attach the stream and flicker

### Verified
Cycled all five tabs in the browser: camera visible on each at a steady
260px, and a probe attribute on the video node confirmed it is the *same*
element throughout — never unmounted, so the feed can't break on a tab change.

## Feature inventory (what exists today)

Written out in full so the gaps below are legible. Detail for each is in
[spec.md](spec.md).

**Editor** — Monaco (self-hosted), tabbed with dirty-state dots, Ctrl/Cmd+S,
auto-save, syntax highlighting for ~65 file types, breadcrumbs. `.ipynb` opens
as a real notebook (code + markdown cells, Run All, per-cell run).

**Explorer** — file tree, create/rename/delete files and folders inline,
per-language brand icons, resizable, candidate profile footer.

**Terminal** — real shell: pipes `|`, redirects `> >> < 2>`, chaining
`&& || ;` on real exit codes, `$VAR`/`${VAR}`/`$?`, `export`, aliases, globs,
quoting. Line editor with history, Tab completion, Ctrl+A/E/U/K/W/C/L.
Multiple independent sessions. Toolbelt: `grep sed find head tail wc sort
uniq cut tr diff tree ls cp -r`.

**Execution** — Python (Pyodide/real CPython), JavaScript (native ESM),
TypeScript (real `typescript` compiler).

**Packages** — `pip` via micropip (real PyPI + Pyodide WASM index); `npm` via
the real registry + esm.sh, mirrored to a visible `node_modules/`.

**Version control** — real git (isomorphic-git): `init add status commit log
branch checkout rm config`. Objects in IndexedDB, working tree in the VFS.

**Projects** — `npm create vite` fetches the real create-vite template;
`dev` / `npm run dev` builds a live preview that rebuilds on every edit and
holds the terminal until Ctrl+C.

**Preview** — sandboxed iframe beside the terminal, live/stopped badge.

**Proctoring** — mandatory camera, workspace locked until live, visible on
every panel tab.

**Chat** — floating launcher + panel. Interface only, no model connected.

**Persistence** — workspace in `localStorage`, packages and git in IndexedDB.

---

## Panel tabs — making them real (VS Code parity)

Today Problems / Output / Debug Console / Ports are hardcoded empty states.
Each entry below records what VS Code actually does (from its docs), what we
can honestly do here, and the work.

### Problems
**VS Code:** shows warnings and errors from language services, tasks and
linters that analyse code in the background. Each diagnostic carries
severity, file, line, message, and source/code. Entries group by file;
clicking one jumps to that location. Also surfaces as inline squiggles, marks
in the overview ruler, and a Status Bar error/warning count.

**Here — genuinely doable.** Monaco *is* the VS Code editor and already runs
the real TypeScript language service; it publishes diagnostics as **markers**
(`monaco.editor.getModelMarkers()`), the same model VS Code's `Diagnostic`
API uses. Nothing needs faking.

- [x] Create Monaco models for every workspace file, not just opened ones, so
      diagnostics cover the project rather than the current tab
- [x] Read markers, group by file, sort by severity then line
- [x] Severity icon + `file:line:col`, message, and source
- [x] Click a row → open that file
- [x] Error/warning counts in the Status Bar
- [ ] Reveal the exact line on click (currently opens the file only)
- [ ] Clicking the Status Bar counts focuses the Problems tab

**Bug worth remembering:** the instance must come from `loader.init()`, not
`import("monaco-editor")`. The editor runs from the self-hosted AMD bundle at
`/monaco-editor/vs`; importing the npm package gives a *second*, unrelated
Monaco whose marker registry the running editor never writes to — Problems
sits permanently empty with nothing visibly wrong. Cost a debugging round.

**Verified live:** a file with `const n: number = "not a number"` and an
undefined identifier produced exactly `ts(2322)` and `ts(2304)` at the right
line/column, grouped under the file, with a count badge on the tab and
`2 errors / 0 warnings` in the Status Bar. A clean file reports nothing.

### Output
**VS Code:** named channels — build systems, tasks, language servers — with
a dropdown to switch between them. Append-only logs, clearable.

**Here — doable.** We already generate exactly this kind of log; it currently
only goes to the terminal, where it's mixed with the shell.

- [x] Channel registry with a dropdown, append + clear, bounded at 500 lines
- [x] Route the preview builder into a "Preview" channel (rebuild timings and
      build failures, emitted by the watcher rather than a command)
- [x] Route `pip`/`npm` into a "Packages" channel
- [x] Route git into a "Git" channel
- [ ] Per-channel filter box (VS Code has one)
- [ ] Auto-switch the panel to a channel that starts producing output while
      Output is already open

**Design note:** routing lives in *one* place — `channelForCommand` consulted
by `execute.ts` after each command — so commands never learn the Output panel
exists. A command with no channel simply doesn't log, which is why `node` and
`python` don't: program output belongs in the terminal, as in VS Code.

The store is deliberately plain (no React, no DOM) because shell commands
write to it from outside React's render cycle and the engine has to stay
drivable in Node. The panel binds via `useSyncExternalStore`.

**Verified:** 21/21 in Node — routing map, real `git`/`npm` output captured
with the command line echoed, errors captured too, non-routed commands
leaving every channel untouched, channel isolation, clear, subscriber
notification, snapshot identity changing so React re-renders, multi-line
splitting, and the 500-line bound keeping the newest lines. The empty state
was confirmed in the browser; the populated panel wasn't, because terminal
input automation kept dropping keystrokes.

### Ports
**VS Code:** lists locally-running services, forwards them via dev tunnels.
Each row shows the port and its forwarded address; hovering offers copy
address, open in browser, open in-editor preview; right-click sets
visibility. Explicitly only exposes *locally-running* services.

**Here — partially, and the limit is real.** A browser tab cannot listen on a
port, so genuine forwarding needs the sandbox/backend (PRD §2.3). What we do
have is a running dev preview, which is the thing a port row would point at.

- [x] List the running preview as a row: address, project root, running/stopped
- [x] Actions: focus the preview panel, open the built page in a new tab, stop
- [x] When nothing is running, say *why* real forwarding is unavailable
      rather than a bare empty state
- [ ] Real forwarded ports, once the sandbox exists (PRD §2.3)

**The Port column reads "—" deliberately.** Inventing a plausible number
(5173, say) would be a lie the rest of this workspace doesn't tell — nothing
is bound, because a browser tab cannot bind a port.

**Verified:** the empty state renders with its explanation. The "open in new
tab" action depends on a blob HTML document being able to load blob module
URLs created by the IDE — that was proven directly (an iframe pointed at the
same blob URL executed its module and reported back). Popup delivery itself
is browser-dependent and wasn't observable here, since the automation pane
doesn't track popups. The populated row wasn't rendered either: it needs a
running preview, which needs terminal input that keeps dropping keystrokes.

### Debug Console
**VS Code:** a REPL that evaluates expressions **in the debugger's context**,
with suggestions, `Shift+Enter` for multi-line, and program output
interleaved. Only functions during an active debug session. Distinct from the
terminal (shell commands) and Output (tool logs).

**Here — the REPL half only, and it must say so.** There is no debug adapter,
so no breakpoints, stepping, call stack or variable inspection. What *is*
honest is expression evaluation against the same runtime `node` uses.

- [ ] REPL evaluating JS/TS expressions, result and errors echoed
- [ ] History, `Shift+Enter` for multi-line
- [ ] State it evaluates without a debugger attached — no breakpoints —
      rather than implying a debugger exists

## Backlog / known limitations

Filed as GitHub issues so they don't get lost — none are blocking, all are
honest scope calls documented in [spec.md §8](spec.md#8-known-limitations--out-of-scope):

| # | Issue | Area |
|---|---|---|
| [#4](https://github.com/RishiGoswami-code/Mindfries/issues/4) | Only Python and JavaScript actually execute in the terminal/notebooks | Code execution |
| [#5](https://github.com/RishiGoswami-code/Mindfries/issues/5) | Terminal's `cp` doesn't support copying directories (`-r`) | Terminal |
| [#6](https://github.com/RishiGoswami-code/Mindfries/issues/6) | Jupyter notebook cells don't render rich output (images, plots, HTML) | Notebooks |
| [#7](https://github.com/RishiGoswami-code/Mindfries/issues/7) | Auto Save can't be disabled or configured — no settings UI | Persistence |
| [#8](https://github.com/RishiGoswami-code/Mindfries/issues/8) | Silent data loss risk when `localStorage` quota is exceeded | Persistence |

Not yet filed as issues, lower priority:
- [ ] No settings/preferences panel of any kind beyond the theme toggle
- [ ] No multi-select / bulk operations in the Explorer
- [ ] No search-across-files (Ctrl+Shift+F) — `SearchPanel.tsx` was removed
      with the activity bar and never replaced
- [ ] No undo/redo for filesystem operations (rm, mv, etc. are immediate and final)
