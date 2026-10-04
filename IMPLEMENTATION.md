# Company Portal — Implementation Plan

**Stack:** Next.js + TypeScript, its own app (`company/frontend`) alongside
`candidate/frontend` and `internal-admin/frontend` — same repo shape, no
monorepo package between them.
**Status:** Draft v2 — supersedes the v1 draft; incorporates a full audit of
`candidate/frontend`, `internal-admin/frontend`, the PRD, and every
Supabase migration, plus two confirmed decisions (theme base, billing scope).
**Last updated:** 2026-09-15.

This is the build referred to as "the single biggest thing missing from the
product" in [`task.md`](task.md)'s Company side table and What's next #1.
The product shape it must match is [`System_Archetect_And_PRD.md`](System_Archetect_And_PRD.md)
§1.3 (core user flow), §1.4 (dashboard architecture), §1.10 (data model) —
read those there; this doc doesn't restate them, only what changes to build
them for real against the codebase as it exists today.

---

## 1. Goals & Non-Goals

**Goal:** A company can, for itself, sign up, create a role, pick/configure
an assessment, invite candidates, watch a pipeline, and review evidence
reports — visually and architecturally consistent with `internal-admin`.

**Non-goals for MVP** (unchanged from v1, plus billing — see §3):
- ATS integrations, built-in interview scheduling, AI-generated candidate
  summaries.
- Real payment processing (Stripe or otherwise) — see §3.4.
- Open-ended assessment authoring (rubric/interviewer-prompt editing stays
  admin-only; see §3.5).

---

## 2. What the codebase audit found (replaces v1's "pre-work" checklist)

These are settled facts, not open items — no further audit needed before
starting:

1. **No shared design system exists.** `candidate/frontend` and
   `internal-admin/frontend` are two independent Next.js apps (separate
   `package.json`, no monorepo, no `packages/ui`). They don't even look
   alike: `internal-admin` runs a violet/coral "Bright Platform" system with
   real reusable components (`components/ui.tsx`: `Button`, `Pill`, `Modal`,
   `StatCard`, `PageHeader`, `Field/Input/Select`) and a `Sidebar.tsx` shell;
   `candidate` runs a separate navy/steel palette hardcoded per-component
   with no equivalent component library. The only thing actually shared is
   the `.btn-wipe` button hover mechanic (one CSS class, different colors
   per app).
   **Decision (confirmed with you): Company is built on internal-admin's
   system.** Copy — not import, there's nothing to import from —
   `components/ui.tsx`, `Sidebar.tsx`'s pattern, and `globals.css`'s tokens
   (`--color-accent` violet, `--color-accent-2` coral, `.hair-card`,
   `.panel`, `.btn-wipe`) into `company/frontend`. Restyle only what's
   genuinely Company-specific (pipeline board, score comparison).
2. **Data-fetching pattern confirmed:** both apps read/write Supabase
   directly from Server Components/Server Actions via a per-app `lib/db.ts`
   + `lib/supabase.ts` (service-role key, `server-only`). No React
   Query/SWR anywhere. Company gets its own copy of this same pattern —
   see §5.
3. **Company auth does not exist at all** — not "unconfirmed," genuinely
   zero: no sign-up page, no account table with credentials, no session.
   Both existing apps use custom HMAC-signed cookies + scrypt password
   hashing (`lib/auth/{session,password,scrypt}.ts`), **not Clerk** —
   despite the PRD (§ stack table) naming Clerk, the codebase never adopted
   it, so matching the PRD there would break consistency with what's
   actually built. Company must get the same custom pattern from scratch —
   see §6.
4. **The data model has a real gap, not just missing endpoints to flag.**
   `0002_product.sql` has no `JOB`/role entity. `assessments` conflates "a
   role" and "one candidate's invite" into a single row
   (`company_id, template_id, candidate_email, status, match_score`) — there
   is no entity for a role with many candidates in a pipeline.
   `companies.team` is a `jsonb [{email, role}]` blob, not a real
   multi-user table with credentials. New migrations are required — see §7.

---

## 3. Decisions

| # | Decision | Resolution |
|---|---|---|
| 3.1 | Single login per company, or multiple recruiters/hiring managers with roles? | Multiple, with roles (Admin/Recruiter/Viewer). Team Management is in MVP scope. |
| 3.2 | Company switcher (one recruiter, multiple client companies)? | No. One company per login. No switcher, no `companyId` in routes (see §8). |
| 3.3 | Who creates assessment content — internal team or company? | **Neither, fully.** Per PRD §1.11, Mindfries centrally authors the Game Library (`game_templates`) — task variants, rubric, interviewer prompt. A company **picks a published template** and configures role-scoped fields only (duration override, tech stack, candidate-facing role details). Rubric/interviewer-prompt authoring stays admin-only. This narrows v1's "self-serve... configure sections/weights" wording, which over-scoped into a full assessment builder. |
| 3.4 | Billing: real payment integration, or a display only? | **Confirmed: display only for MVP**, per PRD §2.1 ("billing automation... can wait — manual, ops-run versions are enough until there are paying companies to bill"). Settings/Billing shows plan, seats, and a usage/credits counter — modeled on `internal-admin`'s existing `onboarded_companies`/Costs view. No Stripe, no webhooks, no invoice UI. This removes v1's single biggest timeline risk. |
| 3.5 | Role visibility | Both open-pool and invite-only are already real on the candidate side (`task.md` Candidate #1) — a role's publish step picks one, no new candidate-side work required. |
| 3.7 | Does role creation have to wait for the assessment-template picker (§3.3)? | **No — confirmed, decoupled.** `job_roles.template_id` is nullable in the schema (§7) specifically so a role can be created and published without one. `/roles/new` (built) collects title, tech stack, duration, and visibility only; picking/attaching a published `game_template` is tracked as its own later integration, not a blocker on a company being able to open a role today. |
| 3.6 | How does a company get its first login — self-serve signup, or ops-created? | **Confirmed: ops-created, no self-serve company signup.** Mindfries ops creates the first `company_users` admin row as part of the existing internal-admin onboarding flow (PRD §1.11's `ON1 Create Company Account`) — the same moment that already creates the `companies` row today. There is no `/signup` route in `company/frontend`; `/login` is the only entry point. The company's own admin then invites teammates from `/settings/team` (§6, §11 Phase 4). |

---

## 4. New app scaffold

Create `company/frontend/` as a sibling of `candidate/frontend/` and
`internal-admin/frontend/` — not folded into either existing app. Per
[`ARCHITECTURE.md`](ARCHITECTURE.md)'s standing decision, no new backend
service is needed yet: CRUD goes straight to Supabase from this app's own
server layer, exactly like the other two. `company/backend` stays
unnecessary until there's real compute to do (same reasoning that's kept
`internal-admin/backend` unbuilt).

Bring over from `internal-admin/frontend`, adapting only the nav/copy:
- `app/layout.tsx`, `app/globals.css` (theme tokens + `.btn-wipe`)
- `components/ui.tsx`, `components/admin/Sidebar.tsx` → `components/company/Sidebar.tsx`
- `lib/auth/{session,password,scrypt}.ts`, `middleware.ts` (new cookie name, see §6)
- `lib/supabase.ts`, `lib/db.ts` pattern (new functions, see §7)
- `package.json`/`next.config.ts`/`tailwind` setup — copy as a starting point, same Next/React/Tailwind versions as the other two apps for consistency.

Update the root [`CLAUDE.md`](CLAUDE.md) repo map once this exists — it
currently only lists `candidate/frontend` and `internal-admin/frontend`.

---

## 5. Data-fetching & data access

Same pattern as both existing apps: a `company/frontend/lib/db.ts` with
typed functions (`listJobRoles`, `createJobRole`, `listCandidateApplications`,
`setApplicationStage`, `listCompanyUsers`, `inviteCompanyUser`, …), each
doing a direct `db().from(...)` call behind `server-only`, returning `[]`
gracefully when Supabase isn't configured (matching every existing function
in `internal-admin/frontend/lib/db.ts`). No new data-fetching library.

Company-scoped reads must always filter by the signed-in user's
`company_id` from the session — never trust a client-supplied id.

---

## 6. Auth design

Mirrors `internal-admin/frontend/lib/auth/` exactly, new names only:

- **Table:** `company_users` (id, company_id, email, name, password_hash,
  role `admin|recruiter|viewer`, status `active|invited|disabled`,
  failed_attempts, locked_until) — same shape as `admin_users`.
- **Session cookie:** `mf_company`, same HMAC-SHA256-signed claims shape as
  `Session` in `lib/auth/session.ts` (email, name, role, company_id, exp),
  same `SESSION_SECRET`-gated fail-closed behavior.
- **Middleware:** same edge-only cookie-verify gate as
  `internal-admin/frontend/middleware.ts`, matching `/dashboard`, `/roles`,
  `/candidates`, `/settings`, redirecting to `/login` otherwise.
- **No root/env-configured account** — unlike admin, a locked-out company
  should reach Mindfries support, not have a shared backdoor credential.
- **No self-serve signup (§3.6).** `company/frontend` ships `/login` only,
  no `/signup`. The first `company_users` row (`role = 'admin'`, `status =
  'active'` or `'invited'` if they should set their own password) is
  created from `internal-admin/frontend` — extend its existing onboarding
  action (the one that already calls `createCompany` — see
  `internal-admin/frontend/lib/db.ts`'s `addOnboarded`) to also insert this
  row in the same flow, rather than a Mindfries ops person hand-writing SQL.
- **Invite flow (Phase 4):** an invited teammate gets a `company_users` row
  with `status = 'invited'` and a signed one-time link (reuse
  `internal-admin/frontend/lib/mailer.ts` + `email-templates.ts`'s pattern
  for sending it via Resend) rather than a plaintext temp password. The
  same signed-link mechanism should back the ops-created first admin
  account too, so a company admin always sets their own password rather
  than receiving one in plaintext.

---

## 7. Data model & migrations

New migration `supabase/migrations/0011_company_portal.sql`:

```sql
-- Real per-user company accounts (companies.team's jsonb blob has no
-- credentials and can't back a login).
create table if not exists company_users (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  email           text not null,
  name            text not null,
  password_hash   text not null,
  role            text not null default 'recruiter', -- admin|recruiter|viewer
  status          text not null default 'invited',    -- invited|active|disabled
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists company_users_email_idx on company_users (lower(email));

-- A role a company is hiring for — the entity `assessments` never had.
create table if not exists job_roles (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  template_id  uuid references game_templates(id) on delete set null,
  title        text not null,
  tech_stack   text[] not null default '{}',
  duration_min int,                                    -- override of template default, nullable
  visibility   text not null default 'invite_only',     -- invite_only|open_pool
  status       text not null default 'open',            -- open|closed
  created_at   timestamptz not null default now()
);

-- One candidate's place in one role's pipeline. `assessments` stays as the
-- invite/session record it already is; this is the new per-role, per-
-- candidate pipeline row the dashboard's stage counts read from.
create table if not exists candidate_applications (
  id             uuid primary key default gen_random_uuid(),
  job_role_id    uuid not null references job_roles(id) on delete cascade,
  assessment_id  uuid references assessments(id) on delete set null,
  candidate_name text,
  candidate_email text not null,
  stage          text not null default 'invited', -- invited|in_progress|completed|shortlisted|rejected|hired
  score          int,
  section_scores jsonb not null default '{}',
  time_taken_min int,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists candidate_applications_role_idx on candidate_applications (job_role_id);
create index if not exists candidate_applications_stage_idx on candidate_applications (stage);
```

- `stageCounts` per role (§8's pipeline board) is a `group by stage` query
  against `candidate_applications` filtered by `job_role_id` — no separate
  aggregate table needed at MVP volumes.
- `assessments.company_id`/`template_id` stay as-is; a `job_roles` row is
  what a company-created assessment invite now hangs off, instead of a bare
  `company_id`.

---

## 8. Route map

No `[companyId]` segment — one login is one company, resolved server-side
from the `mf_company` session, matching how `/admin/...` never carries an
admin id today.

```
/login
/dashboard                       → Overview
/roles                           → Job role list, per-role stage-count row (§9)
/roles/new                       → Create role (title/tech-stack/duration/visibility; no template yet, §3.7)
/roles/[roleId]                  → Role detail — full pipeline for that role
/candidates                      → All candidates, cross-role
/candidates/[candidateId]        → Candidate profile + score breakdown
/settings/team                   → Team management
/settings/billing                → Plan + seats + usage display (no Stripe, §3.4)
```

---

## 9. Pipeline stage counts on the role list

Unchanged in concept from v1: `/roles` shows one row per role with a
compact stage-count breakdown (`12 Invited · 5 In Progress · 8 Completed ·
3 Shortlisted · 1 Hired`), each badge deep-linking to
`/roles/[roleId]?stage=shortlisted`. Now backed by a real query —
`select stage, count(*) from candidate_applications where job_role_id = $1
group by stage` — instead of a field that doesn't exist yet. Build the
stage-count badge component once, reuse unchanged on `/roles/[roleId]`.

---

## 10. Permission matrix (confirmed)

| Action | Admin | Recruiter | Viewer |
|---|---|---|---|
| View roles/candidates/reports | ✅ | ✅ | ✅ |
| Create/edit/close a role | ✅ | ✅ | ❌ |
| Invite a candidate | ✅ | ✅ | ❌ |
| Change a candidate's stage (shortlist/reject/hire) | ✅ | ✅ | ❌ |
| Invite/remove teammates, change roles | ✅ | ❌ | ❌ |
| View/change billing | ✅ | ❌ | ❌ |

Confirmed as final — enforced as a single shared `can(action, role)` helper
checked in every write path (Server Action / route handler), not per-page ad
hoc checks, on both `company/frontend` (`lib/auth/permissions.ts`) and
`company/backend` (`internal/httpapi/permissions.go`, ported verbatim).

---

## 11. Build phases

### Phase 1 — Foundation (done)
- `company/frontend` scaffold (§4), theme copy from internal-admin (§2.1)
- `0011_company_portal.sql` migration (§7)
- Auth: `company_users`, session cookie, middleware, `/login`-only, no
  `/signup` (§6, §3.6)
- Extend `internal-admin/frontend`'s onboarding action (`addOnboarded` in
  `lib/db.ts`) to also create the first `company_users` admin row +
  send the signed set-password link, so onboarding a company produces a
  real login on day one instead of an unusable `companies` row (§3.6)
- Sidebar + topbar, empty/loading states confirmed with copied components
- `/roles` list (real data, stage-count badges) and `/roles/[roleId]` detail
  shell, ahead of schedule since the schema/queries already existed (§9)
- **`/roles/new` (real, pulled forward from Phase 3):** creates a role —
  title, tech stack, duration, visibility — with no assessment attached
  (§3.7). Permission-gated via `requireCompanyPermission("role:write")`.
- **Invite a candidate (real, pulled forward from Phase 2):** a form on
  `/roles/[roleId]`, permission-gated via `candidate:invite`. Writes a real
  `assessments` row first (the same table internal-admin's own
  `createInvitation` and `candidate/backend`'s Go `CreateInvitation`
  write to, so the candidate app's existing session/report lifecycle picks
  it up unchanged — `company_id`/`template_id`/`role` carried over from the
  job role, `template_id` still null until §3.3 lands), then a linked
  `candidate_applications` row (`assessment_id` set) so the pipeline board
  has something to show. No email sent to the candidate — matches
  internal-admin's own invite action, which doesn't send one either.

### Phase 2 — Overview + Pipeline (done, except where noted)
- **Overview (real):** all four PRD §1.4 stat cards (Active Roles,
  Candidates in Progress, Completed Assessments, Ready for Review) read
  real counts from `job_roles`/`candidate_applications`.
- **Overview widgets (real, pulled forward):** a weekly invite trend chart,
  a 13-week invite-activity heatmap, a due-dates calendar (from
  `assessments.due_date`) with an upcoming list, and **Recent Activity
  (O5)** — merged role-creation + invite events sorted by time, closing the
  one PRD Overview item that had been outstanding since Phase 1. No new
  event log: the activity feed is derived from the `created_at` these
  records already carry, so stage changes (no timestamped history yet)
  don't appear in it. `lib/overview.ts`'s sparkline/bucket math is copied
  from internal-admin's own (`cumulative`/`perBucket`/`sparkPaths`/`ago`) —
  same reasoning as everywhere else, no invented numbers, only real
  timestamps turned into a shape.
- **Stage filter (real):** `/roles` and `/roles/[roleId]` share one
  stage-count-badge-as-link component behavior — clicking a badge
  deep-links to `/roles/[roleId]?stage=X`, matching §9's original design.
- **Per-candidate stage actions (real, narrower than "bulk"):** Shortlist /
  Hire / Reject buttons on each row in `/roles/[roleId]`, permission-gated
  via `candidate:stage`, each a plain `<form action={changeStage.bind(...)}>`
  — no client component needed. **Not built:** multi-select (checkboxes +
  a bulk-action bar) — every change is still one candidate at a time.
- Score-range and date filters on the pipeline view — not built.
- Permission checks (§10) wired into every write action added so far
  (`role:write`, `candidate:invite`, `candidate:stage`).

### Phase 3 — Candidate Detail + Assessment Integration
- **Candidate report view (real, pulled forward):** `/candidates/[candidateId]`
  reads the session and evidence-based report directly from the shared
  `sessions` / `assessment_reports` / `evidence_items` tables (0002/0006
  migrations) — **not** `candidate/backend`'s `GET /api/v1/sessions/{id}/report`.
  That endpoint authenticates by forwarding the *candidate's own* signed
  session cookie for the Go backend to verify (`candidate/frontend/src/lib/backend/client.ts`);
  a company session has no such cookie to forward, and shouldn't need one —
  reading the same tables directly is the established pattern every other
  read in this codebase already follows (`ARCHITECTURE.md`). Auto-refreshes
  while a report is `pending`/`generating`, same mechanic as candidate/frontend's
  own `ReportAutoRefresh`. Score breakdown by section and stage-change
  actions are still outstanding.
- Side-by-side candidate comparison (2–4, sortable)
- Attach a published `game_template` to an existing role — the picker/
  configure step §3.3 originally scoped into role creation itself, now a
  standalone addition to `/roles/[roleId]` instead of a precondition for
  `/roles/new` (§3.7)

### Phase 4 — Team + Billing
- Invite teammate flow (email via Resend, pending/accepted states, §6)
- Billing/plan page: plan, seats, usage/credits display only (§3.4)

### Phase 5 — Polish + QA
- Cross-portal visual QA against internal-admin (this is now the actual
  reference, not a generic "Admin/Candidate" check)
- Empty/error states, responsive check, accessibility pass on tables/forms

### Backlog / Post-MVP
CSV export, analytics tab, custom branding, assessment builder, audit log,
ATS integrations, interview scheduling, AI summaries.

~~Real Stripe billing~~ — done, see §16 (`company/backend`, a new Go
service — not part of the frontend-only Phase 1-5 sequence above).

---

## 12. Open items — need your input before or during the relevant phase

~~Permission matrix (§10)~~ — resolved: confirmed as-is, 2026-10-04.

~~Role visibility default~~ — resolved: `open_pool` is `/roles/new`'s
pre-selected option, 2026-10-04.

~~Company signup model~~ — resolved: ops-created, no self-serve (§3.6).

---

## 13. Definition of done (per screen)

- Built from the copied internal-admin component set — no one-off styling
  unless genuinely new to Company (pipeline board, score comparison).
- Working empty state and error state.
- Data fetching via this app's own `lib/db.ts`, same shape as the other two apps.
- Permission check applied to every write action, not just visually hidden buttons.
- Reviewed against internal-admin for visual consistency; responsive check done.

---

## 14. Risks

- **Schema-first dependency:** Phases 2–3 cannot proceed meaningfully
  until `0011_company_portal.sql` lands — treat it as a Phase 1 blocker,
  not parallelizable busywork.
- **Permission retrofitting:** designing the matrix once (§10) and calling
  one shared helper everywhere avoids re-auditing every write path later.
- **Theme copy drift:** copying (not sharing) internal-admin's components
  means a future change to one won't propagate to the other automatically
  — accept this for MVP; revisit extracting a real shared package only
  once a third consumer of the same components exists.

---

## 15. Cross-app frontend audit — 2026-10-03

**Scope note:** this section is broader than the rest of this doc. Everything
above is Company Portal-only; this section covers all three frontend apps
(`company/frontend`, `internal-admin/frontend`, `candidate/frontend`), found
by running `tsc`/`eslint`/`next build` on each and reading the source
directly — not by re-deriving the already-known gaps in `task.md`, `spec.md`,
or `AUDIT.md` (Company Portal didn't exist, no sandbox/AI keys, keystroke
telemetry, the AI interview, etc. — all still true and already written down
elsewhere). Nothing below has been fixed yet — this is the findings list,
pending your go-ahead to act on it.

### company/frontend — clean

`tsc --noEmit`, `eslint`, and `next build` all pass with zero errors or
warnings on the current `main` (post Phases 1–5). One harmless note: the
`Modal` component in `components/ui.tsx` (copied verbatim from
internal-admin) has no focus trap, but it's never actually rendered
anywhere in this app — dead code, not a live bug here. See internal-admin's
finding below, where the same component *is* used.

### internal-admin/frontend

1. **High — three write actions silently ignore their own failure result,
   with no error shown to the user.** `components/admin/SessionsView.tsx`'s
   `doReset`/`doRetrigger` (lines 25–32) and `components/admin/LibraryView.tsx`'s
   `togglePublish` (lines 96–100) optimistically update local state *before*
   calling the server action, then never check what it returned — a thrown
   `ForbiddenError` (e.g. a viewer-role admin) or a backend failure leaves
   the UI showing a state that never actually happened, with no toast, until
   the next page load silently reverts it. `components/admin/LeadActions.tsx`'s
   `stage` (lines 40–44) has the same gap for "Mark replied"/"Reject." Other
   components in the same files (and sibling files) correctly check `res.ok`
   and toast on failure — this is an inconsistency/regression, not a design
   choice.
2. **High — the admin sidebar has the exact same "no mobile collapse" bug
   company/frontend's copy of it had before Slice 3 of the Company Portal
   work fixed it.** `components/admin/Sidebar.tsx` is `fixed w-64` with zero
   responsive classes; `app/admin/layout.tsx`'s `<main className="pl-64">`
   is unconditional. No hamburger toggle, no breakpoint hiding anywhere.
   Every `/admin/*` page is unusable at phone width — content starts 256px
   from the left edge with no way to reach the nav. This is the *original*
   component company/frontend's copy was cloned from; it was never fixed
   here.
3. **High — onboarding tells the ops team credentials were emailed even when
   nothing was sent.** `lib/db.ts`'s `addOnboarded()` sets
   `credentials_sent_at` unconditionally, regardless of whether a real email
   went out. `onboardCompany()` only sends a real sign-in link when both
   `COMPANY_PORTAL_URL` and `COMPANY_INVITE_SECRET` are set, otherwise falls
   back to a generic "we'll be in touch" email (itself wrapped in a
   swallowed try/catch, so it may not send at all without Resend
   configured). `OnboardForm.tsx` unconditionally toasts "Credentials
   emailed to {adminEmail}" on any success. The Onboarding page's
   "Credentials sent" metric (`app/admin/onboarding/page.tsx`) will read
   100% today, since per `task.md`/`spec.md`'s own admitted state
   `RESEND_API_KEY` is unset everywhere — meaning the metric is currently
   lying to anyone who reads it as fact.
4. **Medium — no role-based UI gating.** `requireAdminRole()` is the real
   server-side gate and it's called correctly everywhere, but no client
   view ever hides/disables a mutating button for a "viewer" account —
   every Onboard/Invite/Pause/Publish/Reset/Re-trigger button renders fully
   enabled regardless of role. Combined with #1, a viewer clicking one of
   the three broken buttons gets an optimistic UI update and zero error,
   making their read-only account look like it just mutated data.
5. **Low/medium — `parseStarterFiles` doesn't validate paths.**
   `lib/starter-files.ts` (lines 14–41) strips a leading `/` but never
   rejects `../` segments or absolute-looking paths before the result seeds
   a candidate's real IDE workspace verbatim. Admin-only input, but
   unvalidated.
6. **Low — non-null assertion on a field the type itself documents as
   optional.** `app/admin/tracker/page.tsx:21`:
   `leads.filter((l) => l.repliedCount! > 0 || ...)` against
   `repliedCount?: number` in `lib/types.ts:83`. Doesn't throw today
   (`undefined! > 0` just evaluates false), but silences the compiler on a
   field that can legitimately be missing.
7. **Low — `Modal` has no focus trap.** Same component noted as dead code
   in company/frontend, but it's genuinely used throughout internal-admin
   (Onboard company, Invite a candidate, etc.) — Tab/Shift+Tab isn't
   trapped inside it, so a keyboard user can tab out into the page behind
   an open dialog.

### candidate/frontend

1. **High — the IDE header shows a fake assessment name and a fake fixed
   duration for every real session.** `components/ide/IdeShell.tsx:506-507`
   hardcodes `assessmentName="Frontend Engineering — Auth Bug Fix"` and
   `durationSeconds={5400}` as the only call site — regardless of which
   assessment the candidate actually started. `TaskDescriptionPanel` right
   next to it does use the real fetched `taskBrief`. The backend already
   returns everything needed (`getSession()`, already called from the
   report page) but `app/ide/page.tsx` never calls it. A candidate doing
   any real assessment sees the wrong title, and the countdown resets to a
   fixed 90:00 on every page refresh instead of reflecting real elapsed
   time. Breaks a visible part of a proctored assessment.
2. **High — telemetry keeps running after "End session," and a failed
   flush permanently drops that batch of evidence.**
   `components/ide/IdeShell.tsx` never calls `telemetryRef.current?.destroy()`
   on end (the component doesn't unmount, so the keyed effect's cleanup
   never reruns) — the 5-second flush timer keeps firing after the
   candidate was told the session ended. Separately,
   `lib/ide/telemetry.ts`'s `TelemetryBuffer.flush()` clears its queue
   *before* the request's outcome is known; a non-2xx response is only
   `console.warn`'d, never re-queued. Since evidence capture is PRD §1.7's
   stated differentiator, a backend hiccup mid-session silently and
   permanently loses real evidence with nothing surfaced anywhere but a
   devtools console. (Note: this also means the root `CLAUDE.md`'s "the
   workspace captures no telemetry" line is now stale — a real telemetry
   pipeline exists and runs, it just has these two bugs.)
3. **Medium — a malformed `.ipynb` file is silently replaced with a blank
   notebook, then genuinely overwritten on the next edit.**
   `lib/ide/notebook.ts`'s `parseNotebook` (lines 63–89) catches any parse
   error and returns `emptyNotebook()` with no error signal.
   `NotebookEditor.tsx:35` seeds its state straight from this. The next
   cell edit calls `onChange(serializeNotebook(next))`, and IdeShell's
   800ms autosave persists the blank notebook over the original file's
   content.
4. **Medium — a failed Pyodide or git-IndexedDB load is cached forever,
   with no retry.** `lib/ide/pyodide-runtime.ts:67-78` (`getPyodide`) and
   `lib/ide/git/idb.ts:19-33` (`openDb`) both memoize the promise *before*
   it settles and never clear it on rejection — the doc comment's claim
   that it's "safe to call repeatedly" is false once it has failed once.
   One transient hiccup loading the ~13MB Pyodide payload, or one
   IndexedDB open failure, permanently breaks Python execution or git for
   the rest of the session; only a full reload recovers, which can hit the
   same blip again.
5. **Medium — the dashboard's "Open the workspace" link bypasses the whole
   session flow.** `app/dashboard/page.tsx:72-78` is a plain
   `<a href="/ide">`, sitting right next to the real assessment cards that
   go through `startAssessment()` → `/onboarding` → `enterWorkspace()`
   (where the real session/timer/telemetry actually get created). Clicking
   it instead lands in a sessionless workspace — no telemetry, no real
   task brief, and finding #1's fake header — one click away from the main
   dashboard, not gated on anything.
6. **Low — concurrent JS-module terminal sessions can cross-contaminate
   output.** `lib/ide/code-runner.ts:76-96`'s `runJavaScriptModule` swaps
   `globalThis.console` for a collector and restores the original in a
   `finally` — if two terminal sessions run ESM code at overlapping times
   (explicitly a supported scenario), whichever finishes first restores the
   real console while the other is still mid-flight, losing or
   misattributing its remaining output.
7. **Low — several dashboard buttons render as interactive but do
   nothing.** `components/dashboard/SideRail.tsx` ("Read the full list,"
   each resource row) and `components/dashboard/ActivityFeed.tsx` ("See
   all") have hover states and arrow icons implying navigation, but no
   `onClick` at all — not even the "nothing connected yet" honest
   treatment the IDE itself uses elsewhere for its AI chat.
8. **Low — project misconfiguration: `eslint.config.ts`'s `globalIgnores`
   doesn't include `public/**`.** It replaces (rather than extends)
   `eslint-config-next`'s own default ignores, and is missing the
   `public/` directory where the build scripts copy the vendored Monaco
   editor bundle. The result: ESLint lints a ~1MB minified vendor file,
   producing over 32,000 false-positive problems that bury every real
   finding in `npm run lint`'s output. One-line fix (add `"public/**"` to
   the ignore list).
9. **Low — scattered `: any` types**, real type-safety holes, not part of
   any established "Supabase row mapper" convention like company/frontend's:
   `components/dashboard/AccountMenu.tsx:25`,
   `components/dashboard/DashboardNav.tsx:32`,
   `components/profile/EditProfileModal.tsx:19`,
   `components/profile/IdentityCard.tsx:21`,
   `components/profile/NextSteps.tsx:18`,
   `components/profile/ProfileStrength.tsx:17`, `lib/auth/users.ts:28`.
10. **Cosmetic — two unescaped apostrophes** flagged by
    `react/no-unescaped-entities` (`app/environment-check/page.tsx:58`,
    `app/practice/page.tsx:43`) — renders fine at runtime, lint-only.
11. **Not a bug, noting for completeness:** a bare `tsc --noEmit` on this
    app reports `Cannot find name 'LayoutProps'` in `app/layout.tsx` — this
    is Next.js's own generated route-prop type
    (`.next/types/**/*.ts`, in `tsconfig.json`'s `include`), which doesn't
    exist until `next build`/`dev` has run once. Confirmed as a false
    positive: `next build` compiles and typechecks this file cleanly.

---

## 16. `company/backend` — real Stripe billing (done, 2026-10-03)

A Go service, the company-side counterpart to `candidate/backend`'s
Application API — see `ARCHITECTURE.md` for the "why a backend now" decision
and `company/backend/README.md` for the endpoint table and run instructions.

Built in its own 6 phases (scaffold → roles/candidates CRUD → team CRUD →
Stripe billing compute → frontend integration → verification/docs) — not a
renumbering of this doc's Phase 1-5 above, a separate service with its own
sequencing. Each phase shipped on its own branch
(`feat/company-backend-phase1` through `phase6`), verified end to end
against a real local Postgres (and, for billing, real signed Stripe test
webhooks) at every step, not just unit tests — that process caught four real
bugs before they shipped: a nil `TLSConfig` panic on a non-TLS connection
string, `timestamptz` columns needing `time.Time` rather than `string` under
pgx's binary protocol, `PlanForPrice("")` matching whichever plan slot was
left unconfigured, and `stripe-go` rejecting a validly-signed webhook over an
API-version string mismatch a real Stripe endpoint would routinely produce.

**What's live in `company/frontend`:** only the billing routes
(`/settings/billing`'s Upgrade-plan and Manage-billing buttons, admin-only).
Roles, candidates, and team keep reading/writing Supabase directly, same as
before — `company/backend`'s equivalent CRUD routes exist and are tested,
but wiring them in would add a network hop for identical behavior (see
`ARCHITECTURE.md`). **What's not done:** deploying this service anywhere,
and a real Stripe account/keys/Price IDs — both "waiting on a decision",
same status `candidate/backend` already carries for Daytona/Gemini.
