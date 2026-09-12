# Candidate portal — from sample data to a real backend

Companion to [`spec.md`](spec.md) and [`task.md`](task.md), scoped to
`candidate/frontend` only. Those two describe the IDE in detail and are
still accurate about it — this file doesn't repeat that, it picks up where
they leave off: everything *outside* the IDE (dashboard, assessments,
profile, auth), audited file-by-file against what's actually in the shared
Supabase project today, plus what real backend work has to happen next and
in what order.

Where this disagrees with `spec.md`'s "Surface by surface" table, this file
is more current — a large amount of the candidate portal (auth, the
dashboard/profile/assessments pages, notifications) was built after that
table was last updated. `spec.md` still owns the IDE.

Written 2026-09-12, against the `bmawigxhvxjuwkzmyjuz` Supabase project.

---

## 1. What's real right now

| Piece | Where | Real since |
|---|---|---|
| Candidate accounts | `candidate_users` table (`supabase/migrations/0005_candidate_users.sql`) | This session |
| Sign up / sign in / sign out | `lib/auth/{scrypt,session,users}.ts`, `app/login/actions.ts`, `app/signup/actions.ts` — scrypt hash, HMAC-signed cookie, generic refusal + timing-matched dummy work, lockout on the row | This session |
| Page gating | `middleware.ts` — `/dashboard`, `/assessments`, `/profile`, `/onboarding` all require a valid session | This session |
| Published assessments | `listAvailableAssessments()` (`lib/db.ts`) — a real query against `game_templates where status='published'` | Earlier, but see §3 |
| Starting a session | `startSession()` (`lib/db.ts`) — inserts a real row into `sessions` | Earlier |
| GitHub / GitLab verification | `lib/profile/links.ts` — real, live calls to `api.github.com` / `gitlab.com/api/v4`, client-side, no backend needed | This session |

Everything else below is either sample data or browser-only state.

## 2. What's hardcoded

All of it lives in four files, by design (`lib/dashboard/data.ts`'s own
comment: *"a change to one file"*). That discipline paid off — this is a
short table, not a grep through fifteen components.

| File | Exports | Used by |
|---|---|---|
| `lib/dashboard/data.ts` | `candidate` (name/role/location — **never updates from the real signed-in session**), `stats` (4 counters), `setupSteps`, `assessments` (5 rows), `activity` (5 rows), `resources` (3 rows) | Dashboard, Assessments, Profile's evidence summary |
| `lib/profile/data.ts` | `bio`, `availability`, `NOTICE_PERIODS`, `OPEN_TO_OPTIONS` | Profile identity fallback (`resolveIdentity`) |
| `lib/notifications/data.ts` | 4 seeded notifications | The bell dropdown |
| `lib/dashboard/fonts.ts` | n/a — not data | — |

`resolveIdentity()` (`lib/profile/data.ts`) is the one seam already built
for this: it returns the sample identity until `EditProfileModal` saves a
real one to `localStorage`. The same shape needs to exist for **the signed-
in session**, not just a local edit — see §6.

## 3. Live inconsistency found while writing this

**Not a design decision — an actual bug, live right now.** Wiring real
Supabase credentials into `candidate/frontend/.env.local` for the new auth
system had a side effect nobody checked at the time: `supabaseReady()` on
the Dashboard and Assessments pages now returns `true`, so
`listAvailableAssessments()` runs for real — and `game_templates` has **zero
published rows** in this project today. The result:

- `AssessmentNotes`/`AssessmentWall` correctly render the real (empty) list
  — "Nothing pinned here yet."
- `StatNotes` right above it still renders the *hardcoded* `stats` array —
  "Open invitations · 1", "In progress · 1" — because `StatNotes` never
  checks Supabase at all.

One page currently asserts both "you have one open invitation" and "you
have no assessments" at the same time. This isn't a case for the plan below
to eventually fix — it's live in the deployed-shape environment today and
should be the first thing addressed, either by publishing real
`game_templates` rows (internal-admin's Library page already does this for
real) or by making `StatNotes` derive its numbers from the same query
`AssessmentNotes` uses instead of its own hardcoded array.

## 4. What's real, but browser-only

Three localStorage-backed stores (`lib/profile/storage.ts`,
`lib/notifications/storage.ts`), all following the same pattern
(`useSyncExternalStore`, cached-against-the-raw-string to avoid the
infinite-loop bug caught earlier this session):

- **Resume** — a real file, read with `FileReader`, held as a base64
  `data:` URL in `localStorage`. Real for the one browser it was uploaded
  in; gone on another device, gone if site data is cleared, never reaches
  a hiring team. The resume-parse pipeline (`lib/profile/resumeParse.ts`,
  real `pdfjs-dist`/`mammoth` extraction) only ever reads this local copy.
- **Linked accounts** (GitHub/GitLab verified live, LinkedIn/portfolio
  stored as entered) — same browser-only caveat.
- **Identity edits** (name/role/location/bio/availability from
  `EditProfileModal`) — same.
- **Notification dismissals / read state** — lowest-stakes of the four, but
  same mechanism.

None of this is fake — every byte in there is real and was put there by an
honest action. It's *scoped* wrong for a product where a hiring team is
eventually meant to read a candidate's resume: right now there is no path
by which they ever could.

## 5. The structural gap underneath all of it

`candidate_users` (this session's real accounts table) has **no foreign key
anywhere** — not to `sessions`, not to `assessments`, not to anything. A
signed-in candidate and "the sample assessments a candidate might have" are
two things that have never been connected. Concretely:

- `startSession()` takes a bare `candidateName: string`, not a candidate
  id — a session row can't be traced back to the account that started it.
- The `assessments` table from `supabase/migrations/0002_product.sql`
  (candidate + company + template + status + due_date — exactly the shape
  the PRD's data model, §1.10, calls for) **has never been read or written
  by any code in the repo.** `listAvailableAssessments()` reads
  `game_templates` directly and fabricates a generic "invited" status for
  every published template, globally, for every candidate — there is no
  per-candidate invitation today, only "every candidate sees the same pool
  of published games."

This is the one gap worth fixing before any of the others: without it,
"real backend" for the dashboard still means every signed-in candidate sees
identical, ungated content, no different in kind from the sample data it
would replace.

## 6. Target shape

Follows the PRD's own data model (§1.10) — this isn't inventing a new
shape, it's finally using the table that already exists for it.

1. **Wire `assessments` for real.** `listAvailableAssessments()` becomes a
   query joining `assessments → game_templates → companies` filtered by
   `candidate_email = <session email>` (or a `candidate_id` FK added to
   `assessments`, which is the cleaner fix and small: one migration, one
   column, one index). A candidate then sees *their own* invitations, not
   a global pool.
2. **`startSession()` takes the session's candidate id**, not a name
   string, and the `sessions` row gets a real `candidate_id` FK alongside
   the `assessment_id` it should also be carrying (currently only
   `template_id`/`company_id` — there's no link from a live session back to
   the specific invitation it came from).
3. **`resolveIdentity()` gets a third tier.** Today: saved edit → sample.
   Add the signed-in session in between: saved edit → **session name/email**
   → sample. This is what finally fixes the "Welcome back, Rishi" gap
   flagged in the account-menu work earlier this session — once there's a
   real name on the session, the dashboard greeting, the nav avatar, and
   the account menu all read from the same place instead of three
   different fallbacks quietly disagreeing.
4. **Resume storage moves to Supabase Storage.** A real bucket
   (`resumes/<candidate_id>/<file>`), server-only upload via a route
   handler using the service-role key (never the browser talking to
   Storage directly with a public key). `candidate_users` gets a
   `resume_path` column. This is the one change on this list that isn't
   just "connect the wire" — it's a genuine architecture change (base64 in
   `localStorage` → a real file in real storage), and it's what makes a
   resume something a hiring team's future portal could actually open.
5. **Linked accounts (`links` json today) become a real table** —
   `candidate_links(candidate_id, platform, value, stats jsonb,
   verified_at)` — for the same reason: something a company's future
   portal needs to read has to live somewhere a company's future portal
   can reach.
6. **Telemetry (PRD §1.7) — the actual product differentiator, still
   entirely unbuilt** even inside the one surface (`/ide`) that's otherwise
   substantially real. `spec.md` already says this precisely and I won't
   restate it — flagging here only because it's the most consequential gap
   in this whole file, not the least, and it's easy for "make the dashboard
   real" work to proceed for weeks without ever touching it. See `spec.md`
   §"The two divergences that matter" and `task.md`'s "Next, in the order
   I'd do it" — telemetry is already first on that list for good reason.

## 7. Latency & optimization, once this is real

- **`listAvailableAssessments()` as currently shaped is one query.** Once
  it joins three tables (`assessments`/`game_templates`/`companies`) for a
  per-candidate view, make sure it stays one round-trip — a single
  `select` with embedded resources (Supabase's `select("*, game_templates(*),
  companies(*)")` syntax), not three sequential awaits. The admin side
  already has one N+1-shaped read worth copying the *fix* from, not the
  problem (`listLeads()` batches `email_events` in parallel with
  `Promise.all`, then aggregates in memory — same pattern applies here).
- **Add the indexes the new foreign keys need** as part of the same
  migration that adds them — `assessments(candidate_id)`,
  `sessions(candidate_id)`, `candidate_links(candidate_id)` — not as a
  follow-up. An index added after the table has real rows is a locking
  migration; added in the same file, it's free.
- **Published `game_templates` are public, cacheable content** — no
  candidate-specific data in them. Once real companies exist, "assessments
  I've been invited to" still needs a per-request query (it's genuinely
  per-candidate), but the *template* details behind each one (task
  description, tech stack) don't change often and don't vary per viewer —
  worth an ISR/`revalidate` window rather than `force-dynamic` once that
  split exists, instead of today's blanket `dynamic = "force-dynamic"` on
  every page.
- **Resume upload moving to Storage removes the current single biggest
  latency cost on the Profile page** — a multi-megabyte base64 string
  living in `localStorage` and being re-read into a React render on every
  visit. A stored file path is a few bytes; the file itself is fetched only
  when actually needed (viewing it, running the parse pipeline).
- **The IDE's own latency question is a different, larger one** — the
  PRD's Daytona-over-WebSocket execution model (§1.6, §2.3) — and belongs
  to `spec.md`/`task.md`, not duplicated here. The one connection worth
  drawing: once sessions are tied to real candidate accounts (§6.2), the
  telemetry event stream (§6.6) and the sandbox WebSocket are the two
  genuinely latency-sensitive paths in this whole product, and they're the
  same two gaps `task.md` already ranks first and second.

## 8. Phased order

Each phase is independently shippable and leaves the app in a real, honest
state — no phase depends on a later one to not be misleading.

1. **Fix §3 now** (the live stat/assessment contradiction) — either publish
   real `game_templates` rows via internal-admin, or make `StatNotes` derive
   from the same source `AssessmentNotes` uses. Hours, not days.
2. **Add `candidate_id` to `sessions` and `assessments`**, wire
   `startSession()` and `listAvailableAssessments()` to the signed-in
   session (§6.1–6.2). This is the one architectural fix everything else
   in this file sits on top of.
3. **Third-tier `resolveIdentity()`** (§6.3) — small, high-value, fixes a
   visible inconsistency (the dashboard greeting) with no schema change.
4. **Resume → Supabase Storage** (§6.4) — the one genuine architecture
   change on this list; do it once, not incrementally.
5. **`candidate_links` table** (§6.5) — same shape as resume, lower
   urgency (nothing reads it cross-device yet, since there's no company
   portal to read it from either).
6. **Telemetry** (§6.6 / PRD §1.7) — largest, most valuable, already
   correctly ranked first in `task.md`'s own ordering; sequenced last here
   only because everything above it is small and this one is not, and
   shipping the small real fixes first means fewer things are misleadingly
   fake while the big one is in progress.

## 9. Decisions this needs from you before it can go further

- **Backend hosting** (PRD §2.4, still open) — telemetry and the sandbox
  WebSocket both need a long-lived process; Vercel serverless doesn't fit
  either.
- **Resend, or some email sender, configured** — `RESEND_API_KEY` is unset
  in every `.env.local` in this repo today (checked while writing this).
  Nothing currently sends a real email anywhere in either app.
- **Whether "Need Account?" self-serve signup stays the front door**, now
  that §6.1–6.2 make per-candidate invitations real — the PRD's own
  candidate flow (§1.5) starts at *"Candidate Receives Invitation"*, not
  self-registration. Both can coexist (an invited candidate who doesn't yet
  have an account still needs to create one) but which one is the primary
  path affects how `assessments.candidate_id` gets populated on invite.
