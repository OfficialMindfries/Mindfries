# Build status

Tracked against the PRD's MVP scope ([§2.1](System_Archetect_And_PRD.md#21-mvp-scope)).
Detail for the workspace itself lives in
[`candidate/frontend/src/app/ide/task.md`](candidate/frontend/src/app/ide/task.md)
(still accurate, not restated here); detail for what's real vs. sample data
in each app lives in [`CANDIDATE_BACKEND_PLAN.md`](CANDIDATE_BACKEND_PLAN.md)
and [`ADMIN_BACKEND_PLAN.md`](ADMIN_BACKEND_PLAN.md) — both now partially
superseded by this file (see the note at the top of each). This file is the
whole-product view: every MVP line item, marked against what's actually
built, with the gaps named plainly rather than implied.

Rewritten 2026-09-13, after a second pass that: fixed the dashboard's
self-contradiction and its sample-name greeting; wired the `assessments`
table for real per-candidate invitations; wired the IDE's Submit button to
the real backend and added a report-viewing page; started sending real
(scoped) telemetry from the workspace; and, on the internal-admin side, made
Overview real and fixed the Companies page, reconciling it with
`onboarded_companies`. Every "done" claim below was checked against the
current code or verified live against the running stack this pass — several
things the previous version of this file called gaps are now closed; a few
new, more precise gaps replaced them.

**Reviewed again 2026-09-14 — no code changed, this pass only re-checked the
claims above against the current tree and looked for what they'd missed.**
Every "✅"/"🟡"/"❌" above still holds (`go test ./...` still green across
`config`/`httpapi`/`llm`/`session`; the mock task brief, the hardcoded
"Rishi", the duplicate admin support-overrides, and the empty-tables list are
all still exactly as described). What this pass adds: a real Resend email
integration exists now (§"Blocked on a decision" #4, corrected) that the
previous version of this file didn't know about, and a substantial internal
sales-CRM feature (`/admin/targets`) exists that no version of this file has
ever scored or even mentioned — see the new note under "Gaps worth naming."
Neither changes any MVP score; both were real gaps in what this *file* said,
not in the product.

---

## Score against the MVP scope, item by item

**✅ done and real · 🟡 partially done / infra exists but disconnected · ❌ not started**

### Company (§2.1) — 0 of 6, unchanged

| # | Item | Status |
|---|---|---|
| 1 | Sign up | ❌ No Company Portal exists at all — no route, no page, nothing. There *is* a real public `/waitlist` page (internal-admin) that writes a row and best-effort-emails the team — but that's pre-launch lead capture feeding the sales Tracker, not a company creating an account, so it doesn't count toward this item |
| 2 | Create a role | ❌ |
| 3 | Select or configure an assessment | ❌ Internal-admin authors templates; nothing lets a *company* pick one |
| 4 | Invite a candidate | 🟡 The `assessments` table this needs is now genuinely wired end to end — a real invitation is visible on the candidate side, starts a real session, and moves through its lifecycle (see "The backend, concretely"). What's still missing is *anything that creates one*: no Company Portal, and no internal-admin UI either — `CreateInvitation` exists in `candidate/backend/internal/db` and is called by nothing |
| 5 | See assessment status | ❌ |
| 6 | Review an evidence-based report | ❌ A report can now be generated and viewed on the *candidate* side (see Candidate #9) — nothing on a company-facing surface exists to review one, because no company-facing surface exists |

**Still the single largest hole in the MVP.** Every other portal has
meaningful coverage now; the Company Portal has none. A company today has no
way to do anything the product exists for except author templates from the
*internal* admin side, or have Mindfries ops create an invitation on their
behalf via a direct database write (there is no admin UI for even that yet).

### Candidate (§2.1) — 9 items: 6 done, 3 partial, 0 fully not-started

| # | Item | Status |
|---|---|---|
| 1 | Accept invitation | 🟡 Improved, not resolved: a real invitation now works end to end once one exists (see Company #4) — but nothing can create one except a direct database write, so in practice every candidate today still arrives via self-serve sign up |
| 2 | Complete basic setup | ✅ Onboarding wizard — consent, device/camera check, instructions lobby — all real, all gated by middleware |
| 3 | Enter the coding environment | ✅ Backed by a real session row (real `candidate_id`, and now real `assessment_id`/`company_id` when started from an invitation) — verified live repeatedly |
| 4 | Read the task | ❌ **More precisely wrong than "missing":** `TaskDescriptionPanel` exists and renders in the IDE, but its content is `MOCK_TASK_MARKDOWN` — a hardcoded "Authentication Bug Fix" brief shown for every assessment regardless of which one is actually running. Confirmed live: a candidate starting "UI Submit Flow Test" still saw the fake auth-bug task. There's no schema field for a real task brief to come from yet |
| 5 | Modify a real codebase | ✅ Full virtual filesystem, real Monaco editor, real git (isomorphic-git) — see the IDE's own task.md |
| 6 | Use terminal and tests | 🟡 Terminal is fully real. "Tests" isn't: no test runner or results panel |
| 7 | Interact with an AI assistant | 🟡 Chat panel UI is real; no model behind it. The backend's OpenRouter client could answer it — nothing connects the two |
| 8 | Complete an AI follow-up interview | ❌ Gemini Live API needs a real-time bidirectional-audio bridge that doesn't exist; the backend says so honestly (`ErrInterviewNotImplemented`) |
| 9 | Submit | ✅ **Now real, end to end.** The header's Submit → confirm → real `POST /sessions/{id}/submit` call → redirect to a new report page. Verified live: signed up a candidate, started a session, clicked through to Submit, watched it redirect to `/assessments/{id}/report` showing the honest "OpenRouter is not configured" failure, confirmed in the database that the session was `submitted` and the report row matched exactly |

### Platform (§2.1) — 6 items: 2 done, 4 partial

| # | Item | Status |
|---|---|---|
| 1 | Provision an isolated sandbox | 🟡 Unchanged: the Go backend's Daytona client is real and wired into session start, but no `DAYTONA_API_KEY` exists anywhere, so it always answers "not configured." The IDE still has no concept of a remote sandbox to provision into |
| 2 | Track candidate events | 🟡 **Real signal now flows, deliberately scoped.** The workspace's Output-channel store (git/npm/pip activity, preview rebuild results — already real, already tested) is relayed into a telemetry buffer, plus file saves, batched and POSTed to a new same-origin `/api/telemetry` route that forwards to the backend's real ingestion endpoint. Verified live: an authenticated POST returned `202 {recorded:1}` and the row landed in `activity_events`. **Not captured:** raw terminal command lines — that would mean touching `vfs-shell.ts`'s line editor, the one surface with both the heaviest test coverage (30/30, 18/18) and the most documented automation fragility in the repo. A deliberate, disclosed scope cut, not an oversight |
| 3 | Run tests | ❌ |
| 4 | Store code changes | 🟡 Unchanged: real locally (IndexedDB via isomorphic-git), nothing syncs to the backend |
| 5 | Generate evaluation evidence | 🟡 The pipeline is real and tested; it can now actually receive real (if partial) evidence when a session has telemetry and `OPENROUTER_API_KEY` set — neither key has been configured anywhere yet, so every real run to date has honestly reported "not configured" or "no usable evidence," never a fabricated read |
| 6 | Generate a final report | ✅ **Now real, end to end**, closing what was the previous version of this file's #3 named gap. `assessment_reports`/`evidence_items`, the generation pipeline, `GET /sessions/{id}/report`, and now a real candidate-facing page that polls while evaluation runs and shows the true terminal state (ready or honestly failed) |

### Internal Admin (§2.1) — 3 of 4 items fully real, 1 partial (a live bug on one onboarding path); both known-wrong pages from last pass are still fixed

| # | Item | Status |
|---|---|---|
| 1 | Onboard a company + assign team | 🟡 **The data model is genuinely reconciled; the path to it has a live bug.** `addOnboarded()` creates a real `companies` row *and* the `onboarded_companies` sales record, linked by a new `company_id` FK (`0007_link_onboarded_companies.sql`) — verified against the real database: the join resolves, the company has the right name/status/team. But the Tracker's own `OnboardForm` → `onboardCompany` action that's supposed to reach it sends an unguarded confirmation email first (see gap #2) and, with no `RESEND_API_KEY` configured anywhere, that throws before `addOnboarded()` runs — so right now this specific path fails outright. The Companies page's separate `onboardCompanyAccount` path still works standalone (see below) |
| 2 | Author and publish assessment templates | ✅ Real (`game_templates`, `supabaseReady()`-gated with an honest sample fallback) |
| 3 | View live/past sessions globally | ✅ Real — still a name-based join (company/template names), not yet reading the `candidate_id`/`assessment_id` FKs a Go-backend-created session now carries |
| 4 | Reset a session / re-trigger evaluation | ✅ Real, wired to a UI, direct to Supabase. The Go backend's equivalent endpoints remain real but unused — still worth consolidating, still not urgent |

**The two pages that were actively wrong, not just incomplete, are both
fixed this pass.** Overview (`app/admin/page.tsx`) imported mock data
unconditionally with no `supabaseReady()` check at all — it now branches
exactly like Library/Sessions/Companies, verified live (signed in with a
throwaway admin account, confirmed real zeros with no sample badge).
Companies was a client component writing an onboarding form's input to local
`useState` and nowhere else — it's now a real Server Component + client view
pair backed by real `listCompanies`/`createCompany`/`setCompanyStatus`,
verified live (created a company, reloaded the page, it was still there;
paused it, reloaded, still paused).

---

## The backend, concretely

`candidate/backend` (see its own [README](candidate/backend/README.md) for
the full endpoint list) — adoption has moved substantially since last time:

| Capability | Backend has it | Something calls it |
|---|---|---|
| Session verification (`mf_candidate`/`mf_admin`) | ✅ | ✅ |
| List assessments (real invitations + open pool) | ✅ | ✅ |
| Start a session (invitation or open template) | ✅ | ✅ |
| Session status | ✅ | ✅ (the report page reads it for context) |
| Telemetry ingestion | ✅ | ✅ (git/npm/pip/preview/file-saves — see Platform #2) |
| Submit + evaluation pipeline | ✅ | ✅ |
| Report retrieval | ✅ | ✅ (the new report page) |
| Real-time WebSocket hub | ✅ | ❌ still no browser client connects — telemetry and the report page both use plain REST/polling, not the hub |
| Admin: session monitor, reset, retrigger | ✅ | ❌ internal-admin still goes direct to Supabase |
| OpenRouter (4 evaluation agents) | ✅, honestly refuses without a key | — no key configured anywhere |
| Daytona (sandbox provisioning) | ✅, honestly refuses without a key | — no key configured anywhere |
| Gemini Live (AI interview) | Interface only — **not implemented**, by design | — |

Read that table as: **almost everything the backend can do now has
something real calling it.** The two rows still unconnected — the WebSocket
hub, and internal-admin's own use of the Admin API — are both legitimate
next steps, not oversights hiding behind a green checkmark elsewhere.

---

## Gaps worth naming

Not "not built yet" — places where the app currently says or implies
something untrue, or two things exist that contradict each other. Most of
what carried this heading last time is fixed; what's left is more precise.

1. **The task brief inside the IDE is fake, specifically.** Every assessment
   shows "Authentication Bug Fix" (`MOCK_TASK_MARKDOWN`) regardless of which
   real assessment the candidate actually started — confirmed live. This is
   worse than "no task panel," because the panel exists and looks connected.
2. **The Tracker's "onboard a company" action is currently broken outright,
   and even working it would promise something false.** `onboardCompany` in
   `internal-admin/frontend/app/admin/actions.ts` (wired to the Tracker's
   `OnboardForm`, and the specific path Internal Admin #1's "verified against
   the real database" check describes) calls `sendMail(...)` as its *first*
   step, unguarded and with no `try/catch` of its own — unlike the waitlist
   form's deliberately best-effort send. With `RESEND_API_KEY`/`RESEND_FROM`
   unset, which is the actual state of every environment right now (see
   "Blocked on a decision" #4), that `sendMail` call throws before
   `addOnboarded()` ever runs, so the whole action fails and **no company or
   `onboarded_companies` row gets created at all** — not a partial success,
   a hard stop. (This is likely why that specific check passed during
   verification: it needs a `RESEND_API_KEY` set, at least locally and
   temporarily, to get past the first line — worth confirming with whoever
   ran it.) Separately, and true even once a key exists: the email it sends
   tells the company to "Sign in at `https://app.mindfries.com`" with a real
   temp password — but there is no company login anywhere in this codebase.
   No Company Portal exists (Company #1), and there's no `company_users`-style
   table with a `password_hash` the way `admin_users`/`candidate_users` have
   (migrations `0004`/`0005`) — `companies`/`onboarded_companies` store no
   credentials at all, and `0001_tracker.sql` says so directly: "we do NOT
   store the temp password — it's emailed once and discarded." The Companies
   page's own onboarding path (`onboardCompanyAccount`, used by
   `CompaniesView.tsx` — the one this file's Companies-page work actually
   changed this pass) is unaffected: it never sends email and isn't broken.
3. **Telemetry captures a real but partial picture.** Stated plainly so
   "the IDE sends telemetry now" isn't read as more than it is: git/npm/pip
   activity, preview rebuilds, and file saves are real; raw terminal command
   lines are not captured (see Platform #2 for why, and the deliberate scope
   line in `lib/ide/telemetry.ts`).
4. **Two implementations of admin support-overrides still exist** — unchanged
   from last time. Not a correctness bug, a maintenance one if they're ever
   edited separately.
5. **Most tables that matter are still empty in production.** Checked while
   writing this: `game_templates`, `sessions`, `candidate_users`,
   `assessments`, `activity_events`, `assessment_reports` are all at (or
   very near) zero real rows; `companies` now has real write paths but no
   standing rows either. Every "real" path described above has been proven
   to work end to end against the real database, each time by creating test
   rows and deleting them immediately after — none of it has real production
   data behind it yet.
6. **The IDE's own Explorer footer still shows a hardcoded candidate name
   ("Rishi")**, unrelated to and unfixed by the dashboard identity fix from
   this pass — confirmed live, still true, not yet threaded through.
7. **This file has never scored or even mentioned a real feature that
   exists: internal-admin's account-based-outreach CRM at `/admin/targets`.**
   It's not sample data — `supabase/migrations/0003_targets.sql`, a real
   `targetsStore()` with a `SchemaNotice` fallback when the migration isn't
   applied yet, and a full set of validated server actions
   (`internal-admin/frontend/app/admin/targets/actions.ts`: create/update/
   delete a target, add a contact, log a touch that advances the pipeline
   stage, bulk stage/owner updates, duplicate-detection against existing
   targets/crawled leads/onboarded customers). It isn't one of the PRD
   §2.1 Internal Admin MVP items — it's a sales tool for Mindfries' own team,
   not a candidate/company/platform capability — so it changes no score
   above. It's named here only because a file whose whole premise is "every
   real thing, checked against the code" was silently missing a real,
   substantial thing. `CLAUDE.md`'s repo map is stale in the same way (its
   `/admin/{...}` route list omits `targets`, and lists `costs`/`waitlist`
   which also go unmentioned in this file) — worth a pass of its own,
   separate from this one.

Resolved since the last version of this file (kept here briefly so the
history is legible, not because they're still open): the dashboard's
StatNotes/AssessmentNotes self-contradiction; the sample-name dashboard
greeting; the missing report-viewing surface; `assessments` never being
read or written; `companies`/`onboarded_companies` being unlinked;
Overview's unconditional mock import; Companies writing to nowhere.

---

## Blocked on a decision

1. **Execution model.** Unchanged: the workspace is browser-only; the PRD
   specifies Daytona sandboxes over a Go WebSocket. Both ends of that bridge
   exist in isolation (the backend's sandbox client and WS hub; the IDE's own
   telemetry and eventual terminal); nothing connects them, and that's a
   deliberate scope decision, not a small wire-up.
2. **Backend hosting target** (PRD §2.4) — resolved in *language*, still open
   in *where*. The process still only runs on a developer's machine.
3. **Per-agent LLM routing** (PRD §2.4) — the access *layer* is settled
   (OpenRouter); *which* model runs each of the four agents is still the same
   open proposal (defaults to Claude, overridable per agent, unconfirmed).
4. **Email — real, but not where the PRD needs it yet, and one call site is
   actively broken by its absence (see gap #2 above).** internal-admin has a
   genuine Resend integration: `lib/mailer.ts` (honestly refuses via
   `mailerReady()` when `RESEND_API_KEY`/`RESEND_FROM` are unset, and exposes
   that check *without* using it everywhere it's called — see gap #2),
   `lib/email-templates.ts`, and an `/api/webhooks/resend` route that records
   delivered/opened/clicked/bounced engagement back onto a lead. Three real
   call sites, all in `app/admin/actions.ts`: `sendLeadEmail` (Tracker →
   send a templated email to a lead), `joinWaitlist` (`/waitlist` signup —
   deliberately best-effort, wrapped in its own `try/catch`), and
   `onboardCompany` (Tracker's onboarding email — *not* best-effort, which is
   the problem in gap #2). `RESEND_API_KEY` is still unset in any deployed
   environment, so no email has actually sent — and none of this touches the
   PRD's candidate/company transactional email (invitations, status
   notifications), since neither of those flows exists yet either. The
   honest-refusal wiring exists but isn't applied consistently, and none of
   it is the product-facing email the PRD actually calls for.
5. **Self-serve signup vs. invitation as the primary candidate entry point** —
   this pass made both genuinely work side by side rather than picking one,
   which is a real answer but possibly a provisional one: worth confirming
   whether that's the intended steady state or a stopgap until the Company
   Portal exists and invitations become the norm.
6. **Raw terminal telemetry** — a real scope decision, not an oversight (see
   Platform #2): capture it by touching `vfs-shell.ts`'s line editor despite
   its test/automation fragility, or accept the git/npm/pip/file-save signal
   as sufficient for now.

## Next, in the order I'd do it

1. **Fix `onboardCompany`** (gap #2) — cheap and currently broken: wrap its
   `sendMail` in the same best-effort `try/catch` `joinWaitlist` already uses
   so a missing Resend key doesn't block creating the company record, and
   drop (or rewrite) the "sign in at app.mindfries.com" line until a company
   login actually exists. Small, but it's the one item here that's an active
   bug rather than a gap, and it sits directly in front of the Internal Admin
   flow the rest of this file calls done.
2. **Company Portal, from zero** (§1.4) — now unambiguously the largest
   single hole in the MVP scope, and the backend-side prerequisite it used to
   wait on (`assessments` being real) is done.
3. **An admin UI for creating an invitation** — the backend (`CreateInvitation`)
   and the candidate-side consumption of one are both real; only the
   authoring surface is missing. Small relative to #2, and unblocks testing
   the whole invitation flow without a direct database write.
4. **Real task-brief content** (gap #1) — needs a schema field (`game_templates`
   has no task-description column today) and an authoring UI in the Library
   page before the IDE side is worth touching.
5. **Get real keys for OpenRouter and Daytona** — everything downstream of
   both has been built to the point where a real key is the only thing left
   between "honestly refuses" and "actually works."
6. **Decide Gemini Live's timeline** — the one MVP item with no partial
   progress possible without committing to building the real-time bridge.
7. **Raw terminal telemetry, if the decision above lands on "yes"** — the
   remaining, harder half of Platform #2.
8. **Wire the WebSocket hub to something** — live status/terminal streaming
   exists server-side with zero consumers; the report page's polling and
   telemetry's REST batching both work without it today, so this is real but
   not urgent.
9. **Consolidate the duplicate admin support-override implementations**
   (gap #4).

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
  unconfigured.
- Telemetry is real but scoped to git/npm/pip/preview/file-save signals —
  not raw terminal command lines (see "Blocked on a decision" #6).
- The Go backend is not deployed anywhere; nobody but a developer's machine
  can reach it.
- OpenRouter and Daytona are both wired for real but unconfigured — every
  call downstream of them answers honestly rather than faking success.

## Testing note

The IDE's shell engine has no DOM or React imports, deliberately — driven
directly against an in-memory filesystem in Node (see its own task.md for
exact counts). The Go backend has real unit tests (`go test ./...`, no live
database needed — this pass added coverage for the invitation-vs-open-pool
mapping and status translation) plus repeated live verification against the
actual running stack: real signups through the actual UI, real sessions
started from both a real invitation and the open pool, a real Submit
click-through to a real report page, a real telemetry POST confirmed in
`activity_events`, and on the internal-admin side a throwaway admin account
(created and deleted directly in the database — no production credentials
touched) used to confirm Overview and Companies against real data. Every
test row created this pass was deleted immediately after verifying.
Anything genuinely browser-dependent and not already covered — Pyodide, the
npm registry, the camera, raw terminal input — still has to be checked by a
human in a real browser; the automation available here reliably drops
keystrokes into xterm specifically (documented in the IDE's own CLAUDE.md),
which is also why raw-terminal telemetry wasn't attempted through it this
pass.
