# Build status

Tracked against the PRD's MVP scope (§2.1). Detail for the workspace itself
lives in [`candidate/frontend/src/app/ide/task.md`](candidate/frontend/src/app/ide/task.md);
this is the whole-product view.

---

## Done

**Candidate Engineering Workspace** (PRD §1.6) — file explorer, Monaco editor,
notebooks, and a real shell with pipes/redirects/chaining/globs. Real
execution for Python (Pyodide), JavaScript and TypeScript. Real package
managers (`pip` via micropip, `npm` via the real registry + esm.sh). Real git
via isomorphic-git. Project scaffolding from the real create-vite templates,
with a live preview that rebuilds on every edit. Camera-proctored sessions.
Brand palette, rounded panel layout, AI chat panel (UI only).

**Repo/infra** — Vercel deploys `candidate/frontend`; Docker image for the
frontend; PRD tech stack finalised, with Gemini confirmed for the AI
interviewer.

## Blocked on a decision

**Nothing is blocked on ambiguity — these need a call, not more work:**

1. **Execution model.** The workspace is browser-only; the PRD specifies
   Daytona sandboxes over a FastAPI WebSocket. The current approach was agreed
   as staging ("browser now, backend next"). Picking up the backend half is
   the single largest remaining piece of §1.6.
2. **Backend hosting target** (PRD §2.4) — Vercel serverless can't host a
   long-lived FastAPI process, WebSocket connections, or Daytona
   orchestration. Needs a host before backend build starts.
3. **Claude-side LLM routing** (PRD §2.4) — the interviewer is settled on
   Gemini; Code Evaluation / Reasoning / Workflow / Report are still marked
   proposed.

## Next, in the order I'd do it

1. **Telemetry in the workspace** (PRD §1.7). The differentiator, and it gets
   more expensive every session — each new panel produces evidence-worthy
   signals that currently vanish. An event bus wired in now is far cheaper
   than retrofitting it across every feature later.
2. **Backend beyond the skeleton** — `candidate/backend` is `/health` and
   `/status`. Everything in §1.8 (evaluation pipeline) and §1.10 (data)
   depends on it existing.
3. **The rest of the §1.6 workspace chrome** — task description panel, timer,
   submit, git-changes view, diff viewer, test results. These are what make it
   an *assessment*, not just an IDE.
4. **Candidate Application** (§1.5) — invite → setup → enter. Today there is
   no way into the workspace except the URL.
5. **Company Admin dashboard** (§1.4) — not started.
6. **Wire the AI agents** (§1.9) — the chat panel is a working interface with
   no model behind it; the AI **interviewer** doesn't exist yet.

## Known limitations, accepted for now

- `pip` installs don't survive a refresh (Pyodide's filesystem is in memory).
  npm installs do persist.
- `npm` is registry + CDN resolution, not real npm — no lifecycle scripts, no
  native addons, no CJS-only packages.
- `git clone/push/pull` need a CORS proxy or the backend.
- The live preview has no HMR — it's a fast full rebuild.
- The AI chat panel has no model connected.
- `apps/web` and `candidate/backend` are not deployed anywhere.

## Testing note

The shell engine has no DOM or React imports, deliberately — it can be driven
directly against an in-memory filesystem in Node, which is how it's tested
(the browser automation available here drops keystrokes into xterm). Anything
genuinely browser-dependent — Pyodide, the npm registry, the camera — has to
be checked in a real browser.
