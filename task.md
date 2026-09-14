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

**2026-09-15 — one real feature shipped, plus the deepest security/lifecycle
pass this file has had.** Shipped: the four social login buttons on the
candidate login page are genuine OAuth now, not just an honest "not
connected" notice — see "Social sign-in is now real," below the MVP tables.
Everything else this pass was investigation, prompted by six direct
questions: does each candidate get an isolated sandbox/codebase and does a
session actually expire once used; can a candidate register for an open
role; can a candidate connect GitHub/LinkedIn via Composio; is the admin
panel genuinely restricted to env-configured accounts; does every API
endpoint actually work; and is any of this hackable. Short answers, detailed
below: **no isolated codebase exists** (every candidate gets the same empty
VFS); **no session ever expires or gets invalidated** (this is the single
worst finding of this pass — see "Sandbox, codebases, and session
integrity"); **there is no open-roles/job-board concept anywhere** in this
codebase, for a candidate or otherwise; **Composio is not integrated or
referenced anywhere** — GitHub/GitLab linking exists but is a stored,
platform-verified profile link (the candidate Profile page, unrelated to
this question — see "Two things that flatly don't exist"), not an OAuth
data connection, and Composio specifically doesn't appear in the codebase at
all; **the admin panel's own gate is sound** — the
env-configured root account and the `admin_users` allowlist are both real
and every admin page is covered — but a real authorization hole sits one
layer inside it (the `viewer` role is carried and validated in the session
cookie but never actually checked anywhere, so a viewer can do everything an
admin can); and **the API surface is mostly real but not uniformly
guarded** — see the new "Security and guardrails" section for the full,
severity-ranked list. None of this changes an MVP score above (session
integrity was never a named MVP line item), but several of these are more
serious than anything previously in "Gaps worth naming," and are added
there now.

**Same day, a follow-up:** given the choice between fixing the "Resume"
button's missing session id and removing the option entirely, the answer
was to remove it — a candidate shouldn't be able to re-enter an in-progress
assessment from the dashboard at all. `AssessmentWall.tsx` now renders no
action for that state. This closes the UI path into the finding above, not
the finding itself — `handleSubmit`/`handlePostEvents` still don't check
session status, so a candidate who still has the `/ide?session=<id>` URL can
re-enter directly. That part is still open as this file's #1 priority below.

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

### Candidate (§2.1) — 9 items: 2 fully done, 5 partial, 2 not started

(The previous header here — "6 done, 3 partial, 0 fully not-started" —
didn't actually match its own table, which had #4 and #8 marked ❌; fixed
while re-tallying this pass, along with downgrading #3 and #5 below.)

| # | Item | Status |
|---|---|---|
| 1 | Accept invitation | 🟡 Improved, not resolved: a real invitation now works end to end once one exists (see Company #4) — but nothing can create one except a direct database write, so in practice every candidate today still arrives via self-serve sign up. Sign-up itself now has a second real path: Google/GitHub/GitLab/LinkedIn OAuth, per-provider-configured — see "Social sign-in is now real," below |
| 2 | Complete basic setup | ✅ Onboarding wizard — consent, device/camera check, instructions lobby — all real, all gated by middleware |
| 3 | Enter the coding environment | 🟡 Backed by a real session row (real `candidate_id`, and now real `assessment_id`/`company_id` when started from an invitation) when reached through the normal flow — but `/ide` itself carries no auth check at all (deliberately excluded from `middleware.ts`'s matcher, and the page does no session check of its own), so it's reachable by anyone, signed in or not, with or without a session id. See "Sandbox, codebases, and session integrity" for what that combines with |
| 4 | Read the task | ❌ **More precisely wrong than "missing":** `TaskDescriptionPanel` exists and renders in the IDE, but its content is `MOCK_TASK_MARKDOWN` — a hardcoded "Authentication Bug Fix" brief shown for every assessment regardless of which one is actually running. Confirmed live: a candidate starting "UI Submit Flow Test" still saw the fake auth-bug task. There's no schema field for a real task brief to come from yet |
| 5 | Modify a real codebase | 🟡 **The editing machinery is real; the codebase isn't.** Monaco, real git (isomorphic-git), the full VFS — all genuine, see the IDE's own task.md. But every candidate starts from the exact same thing: `lib/ide/mock-project.ts`'s `initialTree = []` / `initialFiles = {}`, an empty workspace, every time, for every assessment. `game_templates.repo_template` exists in the schema and is written by the admin Library form — but nothing ever reads it back into the IDE to seed real starting files, so it's a column that goes nowhere. There is no per-candidate (or even per-template) codebase anywhere in this product yet — see "Sandbox, codebases, and session integrity" |
| 6 | Use terminal and tests | 🟡 Terminal is fully real. "Tests" isn't: no test runner or results panel |
| 7 | Interact with an AI assistant | 🟡 Chat panel UI is real; no model behind it. The backend's OpenRouter client could answer it — nothing connects the two |
| 8 | Complete an AI follow-up interview | ❌ Gemini Live API needs a real-time bidirectional-audio bridge that doesn't exist; the backend says so honestly (`ErrInterviewNotImplemented`) |
| 9 | Submit | ✅ **Now real, end to end.** The header's Submit → confirm → real `POST /sessions/{id}/submit` call → redirect to a new report page. Verified live: signed up a candidate, started a session, clicked through to Submit, watched it redirect to `/assessments/{id}/report` showing the honest "OpenRouter is not configured" failure, confirmed in the database that the session was `submitted` and the report row matched exactly |

### Platform (§2.1) — 6 items: 2 done, 4 partial

| # | Item | Status |
|---|---|---|
| 1 | Provision an isolated sandbox | 🟡 The Go backend's Daytona client is real and wired into session start, but no `DAYTONA_API_KEY` exists anywhere, so it always answers "not configured." **Worth knowing even once a key exists:** `orchestrator.go`'s provisioning call discards the sandbox ID it gets back (`CreateSandbox(ctx, sandbox.CreateOptions{})` — no repo, no image, no env, and the returned ID is never stored; `sessions` has no `sandbox_id` column to hold it in). `DeleteSandbox` has zero callers anywhere. So configuring the key today would create real, billable, unaddressable Daytona sandboxes with no way to find or clean them up — see "Sandbox, codebases, and session integrity" |
| 2 | Track candidate events | 🟡 **Real signal now flows, deliberately scoped — and unvalidated.** The workspace's Output-channel store (git/npm/pip activity, preview rebuild results — already real, already tested) is relayed into a telemetry buffer, plus file saves, batched and POSTed to a new same-origin `/api/telemetry` route that forwards to the backend's real ingestion endpoint. Verified live: an authenticated POST returned `202 {recorded:1}` and the row landed in `activity_events`. **Not captured:** raw terminal command lines — that would mean touching `vfs-shell.ts`'s line editor, the one surface with both the heaviest test coverage (30/30, 18/18) and the most documented automation fragility in the repo. A deliberate, disclosed scope cut, not an oversight. **Newly found this pass, and not a deliberate cut:** neither the Next.js relay nor the Go handler enforces any payload size or event-count limit, and `event_type` is free text with no schema constraint — see "Security and guardrails" findings F1/F2 |
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

## Social sign-in is now real

The candidate login page's four social buttons (Google/GitHub/GitLab/
LinkedIn) previously said "isn't connected yet" for every provider,
unconditionally — honest, but a dead end. As of this pass they're a genuine
OAuth2 authorization-code flow, **gated per provider** on that provider's own
`CLIENT_ID`/`CLIENT_SECRET` (`candidate/frontend/.env.example`) — a provider
with no app registered still renders the same honest notice as before;
nothing links anywhere that would 404.

- `lib/auth/oauth-providers.ts` — authorize/token/userinfo config and a
  profile-fetch function per provider, plain `fetch`, no SDK.
- `lib/auth/oauth-state.ts` — a signed, single-use `state` cookie (its own
  HMAC pair, independent of the session cookie on purpose) so the round-trip
  can't be forged into a login-CSRF.
- `lib/auth/oauth-login.ts` — find by this exact identity, else link to an
  existing account by the provider's own *verified* email, else create a new
  `candidate_users` row with no password. Never forks a second account for
  an email that already has one.
- `/api/auth/oauth/[provider]/{start,callback}` — the two route handlers,
  both re-checking configuration server-side independently of what LoginForm
  decided to render.
- `supabase/migrations/0008_candidate_oauth.sql` — `password_hash` becomes
  nullable, and a new `candidate_oauth_identities` table links one or more
  provider identities to one candidate account.

**Verified live**, up to the one point that needs an app owner's action in
each provider's own developer console (registering a real OAuth app —
nothing this session can do on its own): with placeholder credentials set,
the start route's own server-side guard, the full redirect with correct
`client_id`/`redirect_uri`/`scope`/`state` actually reaching GitHub's real
`github.com/login/oauth/authorize`, and the callback's state-mismatch
rejection were all exercised against a running dev server. `tsc --noEmit`
and `eslint` are clean on every file touched. **Not yet run against a real
registered app** — that needs `GOOGLE_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_ID`/
etc. actually set to something a provider recognizes, which is a decision
for whoever owns those developer-console accounts, not a code gap.

---

## Sandbox, codebases, and session integrity

Prompted directly by the question "does each candidate get an isolated
sandbox/codebase, and does a session expire once attempted." Short answer to
both: no. This is the most serious pair of findings in this file to date —
more serious than anything previously under "Gaps worth naming" — because
unlike a missing feature, this is the assessment's integrity while it's
being used.

**1. There is no per-candidate (or even per-template) codebase.** Every
candidate's IDE starts from the exact same thing:
`lib/ide/mock-project.ts`'s `initialTree = []` / `initialFiles = {}` — an
empty workspace, every time. `IdeShell.tsx` seeds React state directly from
those two constants; nothing about which assessment or which candidate ever
reaches it. `game_templates.repo_template` exists in the schema
(`0002_product.sql`) and the admin Library form writes it (defaulting to the
literal string `"custom-repo"`) — but nothing ever reads it back to seed
real starting files. The Go backend's own `Template` struct doesn't even
select that column. So "modify a real codebase" (Candidate #5, downgraded
above) is real *editing machinery* over a codebase that doesn't exist yet,
for anyone.

**2. Nothing invalidates a session, ever — not on submit, not on a timer,
not on anything.** Concretely, all verified against the current code:
- `sessions` has `duration_min`/`elapsed_min`/`started_at` and no
  `expires_at`, no `ended_at`, no attempt counter, anywhere in any migration.
- `POST /sessions/{id}/submit` (`candidate.go`'s `handleSubmit`) checks only
  that the caller owns the session — never its current status. A candidate
  can submit, then submit again.
- Submitting again **resets the report**: `CreatePendingReport`'s upsert is
  `on conflict (session_id) do update set status='pending', error=null` — a
  second submit wipes a finished report back to pending and re-evaluates
  whatever's changed since.
- Telemetry ingestion has the same gap: ownership is checked, submitted
  status is not, so events keep landing in `activity_events` after
  submission — which the re-submit above then evaluates.
- The self-serve open pool (as opposed to an invitation) has no attempt
  limit at all: every published template always shows "Start," and nothing
  stops minting an unlimited number of sessions from the same one.
- `/ide` itself carries no auth check (see Candidate #3, downgraded above) —
  so this isn't gated by "you'd need to still be signed in," either.

  **What this means concretely:** a candidate can submit, reload `/ide`
  (their `localStorage` workspace comes back exactly as left), keep editing,
  keep emitting telemetry into the already-submitted session, and press
  Submit again — wiping and regenerating the evidence report on demand,
  as many times as they like, with no record that this happened.

**3. Fixed this pass — the direct way, not the patched way.** The
dashboard's "Resume" button for an in-progress assessment
(`AssessmentWall.tsx`) linked to a bare `href="/ide"` — no `?session=` — so
resuming silently detached the workspace from its session entirely
(`IdeShell.tsx`'s telemetry and Submit-wiring both early-return without a
`sessionId`). The product decision, once this was found: an in-progress
assessment shouldn't be re-enterable at all, so rather than giving the
button its missing session id back, **the button is gone** —
`AssessmentWall.tsx` now renders no action for `in-progress`, the same as
`closed` already had none. **This does not close the underlying gap above**
— the backend still doesn't refuse a submit or telemetry event once a
session has moved past `live`, so a candidate who still has the
`/ide?session=<id>` URL (browser history, a bookmark) can still re-enter
directly. Removing the dashboard's own link to it closes the normal,
UI-driven path; #1 and #2 above are what actually closes the door.

**4. Even a configured sandbox would leak.** Separately from all of the
above (see Platform #1, updated): the Daytona provisioning call in
`orchestrator.go` passes empty `CreateOptions{}` (no repo, no image, no env)
and **discards the sandbox ID it gets back** — there's no column to store it
in and `DeleteSandbox` has zero callers anywhere in the codebase. Configuring
a real `DAYTONA_API_KEY` today would start creating real, billable,
permanently unaddressable sandboxes, on top of everything above.

None of this is softened by "no production data yet" the way some other
gaps in this file are — these are missing checks, not scope cuts, and they
become live the moment a real candidate uses this for a real assessment.

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

### Every endpoint, literally

Answering "does every API actually work" directly needed the full list, not
the capability summary above — so here it is, checked against
`candidate/backend/internal/httpapi/server.go`'s route registration and a
repo-wide grep for each path to confirm what actually calls it.

**`candidate/backend` — all 14 routes, all correctly wrapped in
`requireCandidate`/`requireAdmin` at registration (no endpoint is missing
its auth middleware):**

| # | Method + path | Does | Auth | Called by |
|---|---|---|---|---|
| 1 | `GET /health` | static liveness JSON | none | nothing in the repo |
| 2 | `GET /status` | DB ping + which integrations are configured | none | nothing in the repo |
| 3 | `GET /api/v1/me` | echoes the cookie's claims, no DB read | candidate | **dead** — no caller |
| 4 | `GET /api/v1/assessments` | real invitations by email + published-template pool | candidate | the dashboard |
| 5 | `POST /api/v1/assessments/{id}/sessions` | starts a session (invitation or open template) | candidate | `onboarding/actions.ts` |
| 6 | `GET /api/v1/sessions/{id}` | session status, ownership-checked | candidate | the report page |
| 7 | `POST /api/v1/sessions/{id}/events` | telemetry ingestion | candidate + ownership | `/api/telemetry` |
| 8 | `POST /api/v1/sessions/{id}/submit` | mark submitted, background evaluation | candidate + ownership | the IDE's Submit button |
| 9 | `GET /api/v1/sessions/{id}/report` | report + evidence items | candidate + ownership | the report page |
| 10 | `GET /api/v1/sessions/{id}/ws` | WebSocket join | candidate + ownership | **dead** — no browser client |
| 11 | `GET /api/v1/admin/sessions` | all sessions, joined to company/template names | admin | **dead** — internal-admin goes direct to Supabase |
| 12 | `GET /api/v1/admin/sessions/{id}/ws` | admin WebSocket join, any session | admin | **dead** |
| 13 | `POST /api/v1/admin/sessions/{id}/reset` | support-override reset | admin | **dead** |
| 14 | `POST /api/v1/admin/sessions/{id}/retrigger-evaluation` | re-run the evaluation pipeline | admin | **dead** |

6 of 14 have a real caller. The 8 dead ones aren't broken — they're built,
tested (per the Go test suite), reachable, and simply unused, which is
different from "doesn't work." Confirmed dead by grepping both frontends for
`CANDIDATE_BACKEND_URL` and `/api/v1/` — internal-admin has zero hits.

**`candidate/frontend/src/app/api/**`:**

| Route | Does | Auth | Real or stub |
|---|---|---|---|
| `POST /api/telemetry` | same-origin relay to endpoint #7 above (the httpOnly cookie is scoped to this app's own origin, so the browser can't call the Go backend directly) | forwards the cookie; the Go side re-verifies it independently | real, no logic of its own |
| `GET /api/auth/oauth/[provider]/start` | begins the OAuth flow — see "Social sign-in is now real" | public by design | real |
| `GET /api/auth/oauth/[provider]/callback` | completes it, mints a session | public by design | real |

**`internal-admin/frontend/app/api/**`:**

| Route | Does | Auth | Real or stub |
|---|---|---|---|
| `GET /api/cron/discover` | runs the lead crawler, upserts `leads` | `Authorization: Bearer $CRON_SECRET` — **only enforced when the env var is actually set; see security finding C1** | real; wired to `vercel.json`'s daily cron |
| `POST /api/webhooks/resend` | maps Resend engagement events onto a lead | `?token=$RESEND_WEBHOOK_SECRET` — **same default-allow-when-unset shape; see C2** | real |

The mutating surface of internal-admin isn't in route handlers at all — it's
Server Actions (`app/admin/actions.ts`, `app/admin/targets/actions.ts`,
`app/login/actions.ts`), which Next.js protects with its own built-in
Origin/Host check on the POST that invokes them. See "Security and
guardrails" for what does and doesn't independently guard those actions.

---

## Security and guardrails

Prompted directly by "the system shouldn't be hackable at all." The honest
summary first: **the authentication core (password hashing, session
signing, cookie flags, login throttling, CORS, SQL-injection surface, XSS
surface) is genuinely well built** — better than the rest of this file might
suggest, and worth saying plainly so the findings below read in proportion.
The real problems are a handful of specific, named gaps, not a shaky
foundation. Every finding is grounded in a real file; severities are this
pass's judgment, not a formal scoring system.

### What's solid (so the gaps below aren't over-read)

- **Password hashing:** scrypt, N=2¹⁶/r=8/p=1, 64-byte key, random 16-byte
  salt, constant-time verification (`timingSafeEqual`), a `dummyWork()` step
  that equalizes timing for a nonexistent account so a login page can't be
  used to enumerate which emails have accounts. Identical in both apps.
- **Session cookies:** HMAC-SHA256, verified with `crypto.subtle.verify` (TS)
  and `hmac.Equal` (Go) — constant-time on both ends, and the Go backend
  verifies the *exact same* signature the frontends produce (byte-for-byte,
  confirmed against `internal/session/session.go`), which is what makes
  "session verification: ✅/✅" in the table above actually true rather than
  two independent, coincidentally-compatible implementations. `httpOnly`,
  `sameSite: lax`, `secure` in production, on every cookie this pass touched
  or found, including the two new OAuth cookies.
  `sessionSecret()`/`ADMIN_SESSION_SECRET` fail *closed* — a missing or
  under-32-character secret invalidates every session rather than falling
  back to a constant.
- **Login throttling is real, not decorative.** `failed_attempts`/
  `locked_until` on both `candidate_users` and `admin_users` are actually
  read and written on every login attempt: 8 failures locks the account for
  15 minutes. Contrary to what the schema comment alone might suggest, this
  is wired, not aspirational.
- **No SQL injection surface found.** Every Go query is parameterized; a
  repo-wide grep for string-built SQL turned up nothing but a few DDL
  bootstrap scripts with no user input in them. Both frontends use the
  Supabase query builder exclusively — no raw interpolated SQL anywhere.
- **No XSS sinks found.** No `dangerouslySetInnerHTML`, no `.innerHTML =`,
  anywhere in either frontend. `new Function`/`eval` exist only inside the
  IDE's own sandboxed code runner, which is the deliberate point of that
  feature, not a hole.
- **CORS is correctly implemented**, not just present: exact-match against
  an allowlist (never a wildcard, never a prefix/suffix match), credentials
  only ever paired with a specific echoed origin, `Vary: Origin` set, and an
  unlisted origin gets no CORS headers at all rather than a permissive
  fallback.
- **IDOR protection on the part that matters most is genuinely careful.**
  Every session-scoped candidate endpoint checks the session's
  `candidate_id` against the cookie's own verified id — fails *closed* on a
  null owner, and returns an identical 404 whether a session doesn't exist
  or just isn't yours, so there's no existence oracle. Direct answer to "can
  candidate A fetch candidate B's report by changing the session ID in the
  URL": **no** — checked specifically for a bypass and found none.
- **Admin access is genuinely restricted the way the env-file model
  intends.** `/admin/*` is gated twice (middleware match + an independent
  `currentAdmin()` re-check in the layout, deliberately not trusting the
  middleware alone), every one of the 9 admin pages is covered, the
  env-configured root account (`ROOT_ADMIN_EMAIL`/`ROOT_ADMIN_PASSWORD`) is
  compared with a constant-time check, and every other admin account is a
  real row created only via a CLI script — there's no admin self-signup
  anywhere. **This directly answers "I will use the accounts which I allow
  from env files only for admin access": that gate is sound.** The
  authorization hole below (B1) sits one layer *inside* this gate — it's
  about what a signed-in admin account can do, not about who can sign in.

### Findings, worst first

| ID | Severity | Finding |
|---|---|---|
| — | **high** | **No session invalidation, ever** — detailed above in "Sandbox, codebases, and session integrity." Re-submitting resets an already-generated report; post-submit telemetry is still accepted. |
| — | ~~high~~ **fixed** | ~~The "Resume" button drops `?session=`~~ — fixed this pass by removing the button entirely rather than repairing its link; see "Sandbox, codebases, and session integrity" #3. |
| B1 | **high** | **The admin `viewer` role is carried in the session cookie and validated by the Go backend, but never enforced anywhere in internal-admin.** A repo-wide check for anywhere the frontend reads `role` found only the two type declarations — no server action, no page, checks it. A `viewer` account today can create/delete companies, publish templates, reset sessions, or send lead email exactly like an `admin` account. Real and exploitable the moment a second admin account with the `viewer` role exists — currently moot only because every admin account created so far has presumably been full `admin`. |
| C1 | **high** | **`CRON_SECRET` default-allows when unset.** `app/api/cron/discover/route.ts`'s check is `if (secret && header !== …)` — with the env var unset (its current state, per `.env.example`), the condition is simply false and the route runs for anyone. This is a **deployed, unauthenticated** endpoint (wired into `vercel.json`'s daily cron) that triggers a full lead crawl and writes to the database on any GET request from anyone who finds the URL. |
| F1 | **high** | **No payload size or event-count limit on telemetry ingestion**, on either the Next.js relay or the Go handler. The real client caps itself at 25 events per batch, but that's a courtesy an attacker ignores — an authenticated candidate session can push unbounded data into `activity_events` and into the Go process's request-handling memory. A storage-exhaustion / memory-pressure vector against a shared database, from a signed-in candidate account. |
| A3 | medium | **No server-side session revocation.** Signing out only deletes the cookie client-side; a copied/stolen `mf_candidate` or `mf_admin` cookie stays valid for its full lifetime (14 days for a candidate) with nothing server-side able to kill it early. Disabling a `candidate_users`/`admin_users` row is checked only at sign-in, never on an existing session. |
| B2 | medium | **No server action independently re-checks admin auth.** `app/admin/actions.ts` and `app/admin/targets/actions.ts` rely entirely on the page-level middleware match — a single point of failure. Currently safe (they're only imported from gated pages, and `joinWaitlist`'s public exposure in the same file is intentional), but one misplaced import would remove protection with no second layer to catch it. |
| B3 | medium | **The Go backend's own admin endpoints (`reset`, `retrigger-evaluation`) have no role check either** — same shape as B1, one layer down. Currently dead code (nothing calls them — see the endpoint table above), but they're mounted and running, reachable by any valid `mf_admin` cookie including a `viewer`'s. |
| C2 | medium | **`RESEND_WEBHOOK_SECRET` has the identical default-allow-when-unset shape as C1.** Lower impact (forged delivery/open/click/bounce events poison lead-engagement data; no database write amplification), and the route's own comment already flags it as a stopgap worth upgrading. |
| C4 | medium | **`ssl: { rejectUnauthorized: false }` on every direct-Postgres script** (`migrate.mts` ×2, `admin.mts`) — TLS certificate verification disabled on the connection that carries the database password and writes admin password hashes. A common Supabase-script convention, still a real MITM exposure if anyone runs these off a untrusted network. |
| D1/D2 | medium | **Login throttling is per-account, not per-IP** — password-spraying across many accounts is unthrottled — **and the env-configured root admin account is explicitly exempt from lockout** (it returns before touching the database at all, which is also *why* it can't lock the operator out — a deliberate tradeoff, but worth naming since it's the single highest-value credential in the system). |
| F2/F3 | medium (→ **high** once `OPENROUTER_API_KEY` is set) | **`event_type`/`payload` on a telemetry event are never schema- or content-validated**, and raw payload text is string-joined directly into the evaluation agents' prompts (`orchestrator.go`). Not exploitable today (no OpenRouter key configured anywhere), but a candidate fully controls the exact text handed to their own evaluators the moment one is — a live prompt-injection surface against the evidence report itself. This is squarely inside `task.md`'s own "Next" item on getting a real OpenRouter key: that item should include this fix, not just the key. |
| G2 | medium | `/ide` has no auth check at all — see Candidate #3 above and "Sandbox, codebases, and session integrity." |
| D4 | low | `joinWaitlist` is a public, unauthenticated write with no rate limit and no length caps beyond the email regex — a spam/storage-fill vector on `/waitlist`. |
| C3 | low | The `CRON_SECRET`/`RESEND_WEBHOOK_SECRET` comparisons use plain `!==`, not constant-time — a real but lesser issue given C1/C2 already bypass them entirely when unset. Contrast with the root admin password check, which *is* constant-time — the codebase clearly knows how; these two routes just don't do it. |
| E1/E2 | informational | The Go backend's CORS preflight answers 204 for any origin (harmless without the actual `Access-Control-Allow-Origin`, since the browser still blocks the real request); the WebSocket hub's `CheckOrigin` allows an empty Origin for non-browser clients, which is fine because the cookie check still gates the handshake. |
| G1 | informational now, **high if reused as-is** | The Go admin endpoints have no per-company scoping — correct for an *internal* admin tool today, but `sessions.company_id` exists and nothing filters on it. Flagging now because a future Company Portal (this file's own #1 priority) must not let Company A read Company B's sessions/reports, and reusing these endpoints unchanged for that would do exactly that. |

### What "no production data yet" does and doesn't excuse

It genuinely softens C2, C4, D4, and the reputational cost of the fake task
brief — low-stakes while nobody real is using this. **It does not excuse**
the remaining unlabeled high finding (no session invalidation — the Resume
button that used to compound it is fixed, see above), B1, or C1/F1 — those
become exploitable on literally the first day a real
candidate or a second admin account exists, which is not a hypothetical
future state, it's the very next step after this file's own "Next" list.

### RLS — stated plainly, once

Row Level Security is not used anywhere in this schema, **by explicit
documented design** — three separate migration files say so directly in
their own header comments ("No RLS: only the server… touches these tables
— the browser never queries Supabase directly"). Both Supabase clients are
`server-only` and use the service-role key, which bypasses RLS by
definition; the Go backend doesn't use Supabase at all. This is a legitimate
architecture for a fully server-side app — but the consequence is worth
naming plainly: **there is no defense in depth.** Every finding above is the
*entire* boundary for what it protects — Postgres itself will not catch a
missed check the way it would with RLS in place. That raises the real stakes
of B1 and C1 specifically; they aren't backstopped by anything else.

---

## Two things that flatly don't exist

Direct answers to two more questions this pass was asked, each checked with
a repo-wide search rather than assumed:

- **A candidate cannot register for, browse, or apply to an "open role."**
  There is no job-listing/open-roles concept anywhere in this codebase, for
  a candidate or anyone else — a candidate only ever arrives at a specific
  assessment, either through an invitation (Company #4) or the open
  self-serve pool of published templates (Candidate #1). That pool is a list
  of *assessments*, not roles a company posted; there's no requisition, no
  job description, nothing a candidate picks from beyond "which assessment
  to start." This isn't a partial or disguised version of the feature — it
  doesn't exist in any form, and nothing in the PRD's MVP scope (§2.1) asks
  for it either, so this isn't a scored gap, just a direct answer.
- **Composio is not integrated, referenced, or imported anywhere in this
  repository.** A repo-wide search (case-insensitive, every source file
  type) for "composio" returns zero results. What *does* exist, and is easy
  to mistake for it: the candidate Profile page's GitHub/GitLab linking
  (`lib/profile/links.ts`) checks a typed-in username against that
  platform's real public API and stores the result — real verification, but
  a one-way read of public profile data, not an OAuth connection, not
  Composio, and browser-local (`localStorage`) rather than saved to the
  database. LinkedIn's "connection" on that same page is explicitly *not*
  checked against anything (no public API exists for it) — stored as a
  plain link. Separately, and unrelated to that profile feature: this pass
  added real GitHub/Google/GitLab/LinkedIn *login* via direct OAuth2 (see
  "Social sign-in is now real") — also not Composio, and serving a different
  purpose (signing in) than what "integrate GitHub/LinkedIn" usually implies
  (pulling a candidate's repos, contributions, or connections into their
  evidence). If what's wanted is that richer integration, it would be new
  work either way — Composio or direct provider APIs — not something to
  wire up out of what exists today.

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
8. **The single most important thing this file implied without ever
   checking: a session, once submitted, is still fully live.** Detailed in
   full under "Sandbox, codebases, and session integrity" above — a
   candidate can submit, keep editing, keep sending telemetry, and submit
   again, wiping and regenerating their own evidence report each time, with
   nothing anywhere that notices or prevents it. Every previous version of
   this file scored Candidate #9 ("Submit") ✅ and Platform #6 ("Generate a
   final report") ✅ without this ever being checked — both scores are still
   accurate for what they claim (the mechanism is real), but neither claim
   ever said "and it can't be replayed," which is the part that was untrue
   by omission.
9. **The admin `viewer` role is real data with no real effect.** It's
   generated, stored, put in the session cookie, and validated by the Go
   backend — every piece of plumbing for a permission system exists except
   the one check that would make it a permission system. See "Security and
   guardrails" finding B1.

Resolved since the last version of this file (kept here briefly so the
history is legible, not because they're still open): the dashboard's Resume
button silently breaking the session it resumed — fixed by removing Resume
entirely, a product decision rather than a link fix, see "Sandbox,
codebases, and session integrity" #3; the dashboard's
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

Re-ordered last pass: four items moved to the front because they're cheap
*and* were the most severe things in this file — none of them were here
before because none of them were known before. One of the five that
originally led this list — fixing the "Resume" button — is done; see
"Sandbox, codebases, and session integrity" #3.

1. **Stop a submitted session from being re-entered and re-submitted**
   (gap #8) — the most important fix in this file, and now the only part of
   the session-integrity problem still open (removing the Resume button
   closed the UI path into it, not the underlying gap). At minimum:
   `handleSubmit` and `handlePostEvents` should refuse once a session's
   status has moved past `live`, and `CreatePendingReport`'s upsert
   shouldn't silently overwrite a completed report.
2. **Enforce the admin `viewer` role, or remove it** — either add the one
   check that's missing everywhere `role` is currently just carried and
   validated but never read, or stop implying a permission system exists.
   Same fix should extend to the Go backend's own admin endpoints (B3).
3. **Make `CRON_SECRET` and `RESEND_WEBHOOK_SECRET` fail closed when
   unset**, not open — both currently default-allow (`if (secret && …)`);
   should be "no secret configured → refuse," not "no secret configured →
   let anyone through." `/api/cron/discover` is the more urgent of the two:
   it's deployed and unauthenticated right now.
4. **Add a payload/event-count limit to telemetry ingestion** on both the
   Next.js relay and the Go handler, and constrain `event_type` to the
   values the schema comment already documents — cheap, and directly ahead
   of item 9 below.
5. **Fix `onboardCompany`** (gap #2) — wrap its `sendMail` in the same
   best-effort `try/catch` `joinWaitlist` already uses so a missing Resend
   key doesn't block creating the company record, and drop (or rewrite) the
   "sign in at app.mindfries.com" line until a company login actually
   exists.
6. **Company Portal, from zero** (§1.4) — still unambiguously the largest
   *structural* hole in the MVP scope, and the backend-side prerequisite it
   used to wait on (`assessments` being real) is done. When it's built, give
   it real per-company scoping from day one rather than reusing the
   unscoped Go admin endpoints as-is (security finding G1).
7. **An admin UI for creating an invitation** — the backend (`CreateInvitation`)
   and the candidate-side consumption of one are both real; only the
   authoring surface is missing. Small relative to #6, and unblocks testing
   the whole invitation flow without a direct database write.
8. **Give the IDE a real per-candidate codebase.** Needs `repo_template` (or
   its replacement) to actually resolve into starting files the IDE seeds
   from, instead of the empty `initialTree`/`initialFiles` every candidate
   gets today — see "Sandbox, codebases, and session integrity." This and
   #9 are naturally one piece of work with the same root cause: the IDE has
   never been wired to which assessment is actually running.
9. **Real task-brief content** (gap #1) — needs a schema field
   (`game_templates` has no task-description column today) and an authoring
   UI in the Library page before the IDE side is worth touching.
10. **Get real keys for OpenRouter and Daytona** — for OpenRouter, do item
    4 and F2/F3's validation *first*, or a real key turns the telemetry gap
    above into live prompt injection against the evidence report on day one.
    For Daytona, fix the discarded-sandbox-ID / uncalled-`DeleteSandbox`
    problem before the key goes in, or a real key starts leaking real,
    billable, unaddressable sandboxes immediately.
11. **Decide Gemini Live's timeline** — the one MVP item with no partial
    progress possible without committing to building the real-time bridge.
12. **Raw terminal telemetry, if the decision above lands on "yes"** — the
    remaining, harder half of Platform #2.
13. **Wire the WebSocket hub to something** — live status/terminal streaming
    exists server-side with zero consumers; the report page's polling and
    telemetry's REST batching both work without it today, so this is real
    but not urgent.
14. **Consolidate the duplicate admin support-override implementations**
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
- Social sign-in (Google/GitHub/GitLab/LinkedIn) is real OAuth now, but
  per-provider: each needs its own registered app and
  `CLIENT_ID`/`CLIENT_SECRET` before its button does anything but honestly
  say so — see "Social sign-in is now real."
- Every candidate's IDE starts from the same empty workspace — there is no
  per-candidate or per-template codebase yet, and no assessment session
  currently expires or gets invalidated once used — see "Sandbox, codebases,
  and session integrity." Listed here for completeness; both are serious
  enough to also carry their own gap entries (#8, #9) above, not softened
  scope cuts the way the rest of this list is.

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

**2026-09-15 pass, specifically:** `go test ./...` re-run clean. The new
OAuth code was checked with `tsc --noEmit` (clean project-wide, after
running `next typegen` — a plain `tsc` run without it fails on an unrelated,
pre-existing `LayoutProps` generated-type gap, not anything this pass
touched) and `eslint` (clean on every file added or changed). It was then
driven live against a real dev server: the unconfigured-provider notice, the
`/start` route's own server-side configuration guard (not just the button),
a real redirect reaching GitHub's actual `authorize` endpoint with correct
`client_id`/`redirect_uri`/`scope`/`state` (confirmed via the network
request, not just "it redirected somewhere"), and the callback's
state-mismatch rejection were each exercised and confirmed — the one thing
*not* exercised is a real provider actually approving a real app, which
needs a registered OAuth app this session can't create. The security and API
findings above came from reading the actual source at the cited paths and
lines, not from running an automated scanner — every finding names the exact
file and behavior it's based on so it can be checked independently.
