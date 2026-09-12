# Build status

Tracked against the PRD's MVP scope ([§2.1](System_Archetect_And_PRD.md#21-mvp-scope)).
Detail for the workspace itself lives in
[`candidate/frontend/src/app/ide/task.md`](candidate/frontend/src/app/ide/task.md)
(still accurate, not restated here); detail for what's real vs. sample data
in each app lives in [`CANDIDATE_BACKEND_PLAN.md`](CANDIDATE_BACKEND_PLAN.md)
and [`ADMIN_BACKEND_PLAN.md`](ADMIN_BACKEND_PLAN.md). This file is the
whole-product view: every MVP line item, marked against what's actually
built, with the gaps named plainly rather than implied.

Rewritten 2026-09-12, after the candidate backend (Go) was built and the
candidate frontend wired to three of its endpoints. Every "done" claim below
was checked against the current code, not carried over from the last time
this file was written — several things it used to say are no longer true in
either direction (some gaps closed, one new one opened by the rewrite
itself — see "Gaps worth naming").

---

## Score against the MVP scope, item by item

**✅ done and real · 🟡 partially done / infra exists but disconnected · ❌ not started**

### Company (§2.1) — 0 of 6

| # | Item | Status |
|---|---|---|
| 1 | Sign up | ❌ No Company Portal exists at all — no route, no page, nothing |
| 2 | Create a role | ❌ |
| 3 | Select or configure an assessment | ❌ Internal-admin authors templates; nothing lets a *company* pick one |
| 4 | Invite a candidate | ❌ The `assessments` table this needs (candidate + company + template + status) has existed since the first product migration and has never been read or written by any code — see "Gaps" |
| 5 | See assessment status | ❌ |
| 6 | Review an evidence-based report | ❌ Nothing anywhere renders a report — see "Gaps" |

**This is the single largest hole in the MVP.** Every other portal has at
least partial coverage; the Company Portal has none. A company today has no
way to do anything the product exists for except author templates from the
*internal* admin side.

### Candidate (§2.1) — 9 items, roughly 4 done, 4 partial, 1 not started

| # | Item | Status |
|---|---|---|
| 1 | Accept invitation | 🟡 There's no invitation to accept (see Company #4) — but self-serve sign up/sign in is real: scrypt hashing, HMAC-signed session cookie, lockout, generic-refusal timing, all real (`candidate/frontend/src/lib/auth`) |
| 2 | Complete basic setup | ✅ Onboarding wizard — consent, device/camera check, instructions lobby — all real, all gated by middleware |
| 3 | Enter the coding environment | ✅ Real, and as of this session backed by a real session row with a real `candidate_id` — verified live against the running stack (signed up a real account, started a real assessment, confirmed the row in Postgres) |
| 4 | Read the task | ❌ The lobby shows the assessment's role/company/tags; nothing inside the IDE itself shows the actual task brief. No task-description panel exists |
| 5 | Modify a real codebase | ✅ Full virtual filesystem, real Monaco editor, real git (isomorphic-git) — see the IDE's own task.md |
| 6 | Use terminal and tests | 🟡 Terminal is fully real (pipes, redirects, a real Unix toolbelt). "Tests" isn't: there's no test runner or results panel — `npm test` would just refuse the way `build`/`lint` do today |
| 7 | Interact with an AI assistant | 🟡 Chat panel UI is real and well-built; no model behind it. The backend now has a real OpenRouter client that *could* answer it — nothing connects the two yet |
| 8 | Complete an AI follow-up interview | ❌ Gemini Live API needs a real-time bidirectional-audio bridge that doesn't exist. The backend says so honestly (`ErrInterviewNotImplemented`) rather than faking it |
| 9 | Submit | 🟡 The backend has a real submit endpoint that runs the full evaluation pipeline (tested end to end). There is no Submit button or flow in the IDE that calls it |

### Platform (§2.1) — 6 items, 0 fully done, 4 with real infra sitting unused

| # | Item | Status |
|---|---|---|
| 1 | Provision an isolated sandbox | 🟡 The Go backend has a real Daytona client (`internal/sandbox`) wired into session start — but `DAYTONA_API_KEY` isn't set anywhere, so it always answers "not configured." Separately, the IDE runs entirely browser-side with no concept of a remote sandbox to provision *into* yet — this is the "execution model" decision flagged below, unchanged |
| 2 | Track candidate events | 🟡 The infrastructure is completely real: `activity_events` table, `POST /api/v1/sessions/{id}/events`, real batch insert, real-time fan-out over the WebSocket hub. **Nothing calls it.** The IDE is explicitly documented (its own CLAUDE.md) as local-only "on purpose" — wiring it to the backend is a deliberate, undecided architecture change, not an oversight |
| 3 | Run tests | ❌ |
| 4 | Store code changes | 🟡 Real locally (git objects in IndexedDB via isomorphic-git) — nothing syncs a candidate's code to the backend or database. The "Code and Session Artifacts" piece of the data model has no data flowing into it |
| 5 | Generate evaluation evidence | 🟡 The Go orchestrator and its four OpenRouter-backed agents (Code Evaluation, Reasoning, Workflow, Report) are real and tested — verified live that a submit with no evidence honestly reports "no agent produced usable evidence" rather than fabricating a read. Two things starve it: no telemetry ever reaches it (above), and `OPENROUTER_API_KEY` is unset everywhere, so even a session with events would get an honest "not configured" instead of a real evaluation |
| 6 | Generate a final report | 🟡 `assessment_reports`/`evidence_items` tables, the full report-generation pipeline, and `GET /api/v1/sessions/{id}/report` all exist and work. **No UI anywhere — candidate or admin — reads or displays a report.** Grepped both frontends to confirm: only the client code written to *call* the endpoint exists |

### Internal Admin (§2.1) — 4 of 4 items real, with caveats on 2

| # | Item | Status |
|---|---|---|
| 1 | Onboard a company + assign team | 🟡 The pipeline that's actually used (Tracker → `OnboardForm` → `addOnboarded()`) is real and works — but it writes to `onboarded_companies` (a sales/billing record), not `companies` (the real product-account table from the data model). Winning a deal today produces a row a future Company Portal login couldn't authenticate against. `companies` has **zero rows** and no writer anywhere in the repo |
| 2 | Author and publish assessment templates | ✅ Real (`game_templates`, `supabaseReady()`-gated with an honest sample fallback) |
| 3 | View live/past sessions globally | ✅ Real — and as of this session, a session started through the new Go backend carries a real `candidate_id`, which this page doesn't use yet but could |
| 4 | Reset a session / re-trigger evaluation | ✅ Real, wired to a UI (`SessionsView.tsx` → `resetSession`/`retriggerEval` → Supabase directly). The Go backend now *also* implements both as HTTP endpoints — unused duplicates of a capability the Next.js side already does live. Worth consolidating, not urgent |

Two things also real in internal-admin outside the MVP list, worth naming
because they're the one place this app is actively *wrong* rather than
incomplete: the **Overview** page imports mock data unconditionally with no
`supabaseReady()` check at all, and the **Companies** page is a client
component that writes an onboarding form's input to local React state and
nowhere else. Both are unchanged since `ADMIN_BACKEND_PLAN.md` found them;
neither has been touched this session.

---

## The backend, concretely

`candidate/backend` went from a two-endpoint FastAPI stub to a real Go
monolith this session (see its own [README](candidate/backend/README.md)
for the full endpoint list). What matters for this file is *adoption*, not
just existence:

| Capability | Backend has it | Something calls it |
|---|---|---|
| Session verification (`mf_candidate`/`mf_admin`) | ✅ | ✅ (candidate/frontend, 3 routes) |
| List published assessments | ✅ | ✅ |
| Start a session (real `candidate_id`) | ✅ | ✅ |
| Session status | ✅ | ❌ |
| Telemetry ingestion | ✅ | ❌ |
| Submit + evaluation pipeline | ✅ | ❌ |
| Report retrieval | ✅ | ❌ |
| Real-time WebSocket hub | ✅ | ❌ (no browser client anywhere connects) |
| Admin: session monitor, reset, retrigger | ✅ | ❌ (internal-admin still goes direct to Supabase) |
| OpenRouter (4 evaluation agents) | ✅, honestly refuses without a key | — no key configured |
| Daytona (sandbox provisioning) | ✅, honestly refuses without a key | — no key configured |
| Gemini Live (AI interview) | Interface only — **not implemented**, by design | — |

Read that table as: **the hard, easy-to-get-wrong plumbing (auth, data
access, the agent pipeline's shape, real-time fan-out) is built and tested.
The wiring that would make any of it visible to a candidate or company is
almost entirely still ahead.**

---

## Gaps worth naming

Not "not built yet" — these are places where the app currently says or
implies something that isn't true, or where two things exist that
contradict each other. In the order they'd embarrass the product first:

1. **The dashboard shows two different numbers of your assessments on the
   same screen.** `StatNotes` renders the hardcoded sample stat
   ("Open invitations · 1") while `AssessmentNotes` right below it renders
   the real (now genuinely wired) list from the backend. With `game_templates`
   currently empty in production, that real list is correctly empty — so the
   page asserts "you have 1 open invitation" and "you have no assessments"
   in the same render. Unchanged from when `CANDIDATE_BACKEND_PLAN.md` first
   found it; still a few hours of work, not days.
2. **"Welcome back, Rishi" — for everyone, always.** Confirmed live this
   session: signed up a real account named "Frontend Wiring Test," and the
   dashboard greeting still read the hardcoded sample name.
   `resolveIdentity()` has exactly two tiers (a saved local edit, or the
   sample) — the signed-in session was never added as the tier in between,
   per `CANDIDATE_BACKEND_PLAN.md` §6.3.
3. **A session can be started, but nothing built this session lets anyone
   see what happens to it.** The report pipeline is real; there's no page
   that shows a report. This isn't a "not started" the way the Company
   Portal is — it's a completed backend with an intentionally missing front
   door.
4. **`companies` vs. `onboarded_companies` — the split `ADMIN_BACKEND_PLAN.md`
   flagged is still exactly as unreconciled.** Every "company" anyone can
   currently create in this product is a billing record, not the account row
   a login would need.
5. **`assessments` — the per-candidate-invitation table the whole Company
   flow depends on — is still never touched by any code**, Go backend
   included. `/api/v1/assessments` lists *every* published template to
   *every* candidate; there is no per-candidate invitation, no "this company
   invited this candidate to this template," anywhere in the system yet.
   This is the one piece of schema every unbuilt Company Portal feature and
   every "review a report" feature both sit on top of.
6. **Telemetry has a real destination and nothing sending to it.** Worth
   restating plainly since it's easy to read "the backend has an events
   endpoint now" as progress on PRD §1.7 — it isn't, yet. The product's
   whole differentiator still captures zero signal from a real session.
7. **Two implementations of admin support-overrides now exist** (Next.js →
   Supabase directly, live; Go backend's equivalent endpoints, unused). Not
   a correctness bug — a maintenance one, if both are ever edited separately.
8. **Every table that matters is currently empty in production.** Checked
   directly while writing this: `game_templates`, `sessions`,
   `candidate_users`, `companies`, `onboarded_companies`, `assessments` are
   all at zero rows. Every "real" path described above has been proven to
   work, end to end, against the real database — but none of it has any
   real data behind it yet outside of a session's own testing (created and
   deleted immediately after verifying).

---

## Blocked on a decision

**Still not blocked on ambiguity — each of these needs a call, not more
exploratory work:**

1. **Execution model.** Unchanged: the workspace is browser-only; the PRD
   specifies Daytona sandboxes over a WebSocket (now confirmed Go, not
   FastAPI — see §2.3). The Go backend's sandbox client and WebSocket hub
   exist on the *server* side of that bridge; nothing on the IDE side has
   been built to be the other end of it, and building that is a deliberate
   scope decision, not a small wire-up.
2. **Backend hosting target** (PRD §2.4) — resolved in *language*, not in
   *where*. Go is confirmed; the process still doesn't run anywhere but a
   developer's machine. Vercel serverless still doesn't fit a long-lived
   process with WebSocket connections.
3. **Per-agent LLM routing** (PRD §2.4) — the access *layer* is now settled
   (OpenRouter, confirmed this session); *which* model runs Code Evaluation
   / Reasoning / Workflow / Report is still the same open proposal it always
   was (defaults to Claude, overridable per agent via env var, nobody's
   confirmed it).
4. **Email.** `RESEND_API_KEY` is unset in every `.env.local` in the repo,
   checked again while writing this. Nothing sends a real email anywhere.
5. **Self-serve signup vs. invitation as the primary candidate entry point**
   (`CANDIDATE_BACKEND_PLAN.md` §9) — now more consequential than when first
   raised, since it directly decides how `assessments.candidate_id` (still
   unbuilt) gets populated: does an invite create the account, or does an
   account holder redeem an invite?
6. **`companies` vs. `onboarded_companies`** (gap #4 above) — absorb one
   into the other, or keep both and actually link them. The wrong outcome is
   today's: separate and unlinked.

## Next, in the order I'd do it

1. **Fix the dashboard's self-contradiction (gap #1).** Hours, not days,
   and it's the most visible honesty problem in the product today.
2. **Give `resolveIdentity()` its third tier (gap #2).** Small, same
   category of fix.
3. **Wire `assessments` for real** (gaps #4, #5) — the one schema fix that
   everything else (per-candidate invitations, the Company Portal, a
   reviewable report) sits on top of. `CANDIDATE_BACKEND_PLAN.md` §6.1 and
   `ADMIN_BACKEND_PLAN.md` §5.4 both point at this same table from opposite
   sides; it's one feature, not two.
4. **A report-viewing surface, even a minimal one.** The pipeline that
   produces a report already works; right now that work is invisible.
5. **Telemetry from the IDE to `POST /sessions/{id}/events`** (PRD §1.7) —
   the product's actual differentiator, still the largest genuinely unbuilt
   piece, exactly as ranked in every prior version of this file.
6. **The rest of the IDE's assessment chrome** — task description panel,
   timer, a Submit action that calls the real endpoint, diff viewer, test
   results. What turns the workspace from "a very good IDE" into "an
   assessment."
7. **Company Portal, from zero** (§1.4) — the largest single hole in the
   MVP scope, and nothing before it needs to be finished first except #3.
8. **Fix internal-admin's Overview and Companies pages, and reconcile
   `companies`/`onboarded_companies`** (`ADMIN_BACKEND_PLAN.md` §5.1–5.3) —
   independent of everything above, ready to do any time.
9. **Get real keys for OpenRouter, Daytona, and decide Gemini Live's
   timeline** — everything downstream of these has been built to the point
   where a real key is the only thing left standing between "honestly
   refuses" and "actually works."

## Known limitations, accepted for now

- `pip` installs don't survive a refresh (Pyodide's filesystem is in
  memory); `npm` installs do.
- `npm` is registry + CDN resolution, not real npm — no lifecycle scripts,
  no native addons, no CJS-only packages.
- `git clone/push/pull` need a CORS proxy or the backend.
- The live preview has no HMR — it's a fast full rebuild.
- The AI chat panel has no model connected, even though the backend now
  could answer it — that wire doesn't exist yet.
- Gemini Live (the AI interview) is explicitly unimplemented, not merely
  unconfigured — see "The backend, concretely" above.
- The Go backend is not deployed anywhere; nobody but a developer's machine
  can reach it.
- OpenRouter and Daytona are both wired for real but unconfigured — every
  call downstream of them answers honestly rather than faking success.

## Testing note

The IDE's shell engine has no DOM or React imports, deliberately — it's
driven directly against an in-memory filesystem in Node (see its own
task.md for exact counts). The Go backend has real unit tests
(`go test ./...`, no live database needed) plus, this session, live
verification against the actual running stack: real signup through the
actual UI, a real session created and confirmed in Postgres by its
`candidate_id`/`email` match, then cleaned up. Anything genuinely
browser-dependent on the candidate side — Pyodide, the npm registry, the
camera — still has to be checked in a real browser; the automation
available here reliably drops keystrokes into xterm specifically (documented
in the IDE's own CLAUDE.md), not elsewhere.
