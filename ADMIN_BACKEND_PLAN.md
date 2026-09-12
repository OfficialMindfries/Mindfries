# Internal admin — from sample data to a real backend

Companion to [`CANDIDATE_BACKEND_PLAN.md`](CANDIDATE_BACKEND_PLAN.md), same
exercise, scoped to `internal-admin/frontend`. Where `spec.md`'s "Internal
Admin portal: Scaffolding — routes exist, no data layer" is now well out of
date — most of this app has a real, working data layer; a few specific
pages don't, and it isn't the ones you'd guess from the outside.

Written 2026-09-12, against the same `bmawigxhvxjuwkzmyjuz` Supabase
project the candidate app shares.

---

## 1. What's real right now — genuinely, no fallback

These pages have no sample-data import at all. Empty tables render honest
empty states, not fixtures:

| Page | Reads/writes | Real rows today |
|---|---|---|
| Tracker | `leads`, `email_events` (`lib/db.ts`) | **49** — the daily-discover cron (`/api/cron/discover`) is real and has actually run |
| Waitlist | `waitlist` | 0 |
| Onboarding | `onboarded_companies` | 0 |
| Costs | `onboarded_companies` (same table, different view) | 0 |
| Targets | `target_companies`, `target_contacts`, `target_activities` (`lib/targets-store.ts`) | **102** — the hand-picked list seeded this session |
| Sign in / out | `admin_users`, root-admin env fallback (`lib/auth/`) | Real accounts, real sessions, `middleware.ts` gates every `/admin/*` route |

Targets is also the one page with a genuine, load-bearing honesty feature
worth naming: `SchemaNotice` (`components/admin/targets/SchemaNotice.tsx`)
detects `PGRST205` (table missing) and says so in the UI instead of
crashing or silently falling back — the pattern every other page here
*should* have, and mostly doesn't need to, because they're either fully
real (above) or fully sample (below) rather than something in between that
could fail partway.

## 2. What's real *and* sample, toggled correctly

Two pages check `supabaseReady()` and genuinely switch behavior:

- **Library** (`app/admin/library/page.tsx`) — `listTemplates()` against
  `game_templates` when connected; `mock-data.ts`'s `templates` otherwise.
  Currently connected, currently **0 real rows**, so it's showing sample
  data today — but the code path is honestly conditional, and
  `SampleBadge` says so.
- **Sessions** (`app/admin/sessions/page.tsx`) — same shape, `sessions`
  table, **0 real rows**, same honest sample fallback today.

This is exactly the design `CANDIDATE_BACKEND_PLAN.md` §3 needed and didn't
have — these two pages are the reference for how it should work everywhere.

## 3. What's hardcoded despite Supabase being fully connected

**This is the finding worth reading closely.** Two pages never check
`supabaseReady()` at all — not "sample until connected," just sample,
unconditionally, right now, with a real database sitting right there:

- **Overview** (`app/admin/page.tsx`) — imports `companies, templates,
  sessions` from `lib/mock-data.ts` directly, no live/sample branch, no
  `supabaseReady()` check anywhere in the file. Every number on the page
  ops actually looks at first — active companies, live sessions, published
  games, sessions needing attention — is the same five fixture companies
  and eight fixture sessions every time, regardless of what's actually in
  the database.
- **Companies** (`app/admin/companies/page.tsx`) — worse: it's a **client
  component** that seeds `useState` from `mock-data.ts`'s `companies` array
  and never reads from a server at all. The "onboard a company" form
  genuinely works as UI — it validates, it updates the table, it closes the
  modal — and writes to **nothing**. A refresh loses it. There is no
  `listCompanies`/`createCompany`/`updateCompany` anywhere in `lib/db.ts` —
  checked directly, not assumed. This is the one page in either app that
  currently looks fully functional and isn't, in the specific way this
  project's own conventions exist to prevent.

Why this matters beyond "these two need wiring": `companies` (from
`supabase/migrations/0002_product.sql`) is the real product-account
table — plan, seats, team members, default templates — the row a real
Company Portal (PRD §1.4, not started at all) would need to exist. It is
**never written by any code in this repo.** Onboarding a lead today
(Tracker → the real, working `OnboardForm` → `addOnboarded()`) writes to
`onboarded_companies` instead — a *billing/sales* record (company name,
admin email, plan, monthly cost) that has no relationship to `companies`
whatsoever. **Two separate tables both mean "a company we sell to," and
nothing reconciles them.** Winning a deal through the one real, working
pipeline in this app produces a row that a future Company Portal login
couldn't use to authenticate anyone, because it isn't the table a company
account lives in.

## 4. Schema that exists and has never been touched

Beyond `companies`: `assessments` (0002) is unused by either app (see
`CANDIDATE_BACKEND_PLAN.md` §5) — worth naming here too, since fixing
Overview/Companies without also wiring `assessments` leaves "a company
exists" real without "a company has invited anyone" ever becoming real
alongside it.

## 5. Target shape

1. **`lib/db.ts` gets real company functions** —
   `listCompanies()`, `createCompany()`, `updateCompany()` — same shape as
   every other real function in that file (`db()` null-check, typed row
   mapping, thrown error on write failure). Small, mechanical, and it's
   the one change that turns Companies from looking-done into being-done.
2. **Overview gets the same `supabaseReady()` branch Library and Sessions
   already have** — real aggregate queries (counts, this-month deltas) when
   connected, `mock-data.ts` with `SampleBadge` otherwise. The
   `cumulative`/`perBucket`/`countWithin` helpers in `lib/overview.ts`
   already do the real math correctly (tested, `overview.test.mts`); they
   just need real timestamps to run over instead of fixture ones.
3. **Reconcile `onboarded_companies` and `companies`.** The honest fix
   isn't picking one — they answer different questions (sales pipeline vs.
   product account) and the PRD's data model wants both. `addOnboarded()`
   should, on activation, also create (or link to) a real `companies` row —
   one write becomes two, inside the same function, same transaction where
   possible. Until this lands, "Active Companies" on Overview and "onboard
   a company" in Tracker are two features that sound like the same feature
   and aren't connected.
4. **`assessments` gets a real writer** — an admin action (from a
   `companies` row, pick a candidate + template, create an invitation) is
   the natural first caller, and it's simultaneously the fix
   `CANDIDATE_BACKEND_PLAN.md` §6.1 needs on the other side: the same table,
   written from the admin side, read from the candidate side.
5. **Resend gets configured**, or the gap gets a `SetupToast` entry if it
   doesn't already have one — checked while writing this: `RESEND_API_KEY`
   is unset here too, so waitlist confirmations and any onboarding email
   `addOnboarded()`'s "credentials sent" framing implies are not actually
   being sent by anything.

## 6. Latency & optimization

- **Overview, once real, is the app's most query-heavy page** — four
  metric cards each computing a trend + a 12-point sparkline series, plus
  two panels. `lib/overview.ts`'s helpers already do this in-memory over
  already-fetched rows (not one query per sparkline point) — keep that
  shape. The risk on this specific page once it's real is the *fetch*
  side: pulling every `companies`/`sessions`/`game_templates` row on every
  request to compute aggregates in memory stops being free once those
  tables have thousands of rows instead of eight. Worth a real `count()`
  aggregate query for the headline numbers and a `limit`-bounded query
  (last 90 days, say) for the trend series, rather than "select every row
  ever, then filter in JS" — which is exactly what today's mock-data-backed
  version does, harmlessly, because the fixture is eight rows.
- **`Sessions` — the Global Session Monitor (PRD §1.11) — is specced as
  live**, and today is a `force-dynamic` server-rendered page: accurate at
  the moment of the request, stale a second later, no push. Supabase
  Realtime (already in the confirmed stack, PRD §2.3 — "Realtime primitives
  out of the box if we want them later") is the natural fit once `sessions`
  has real rows worth watching live, rather than polling or reload-to-see.
- **Targets is the one page here already carrying real, growing row
  count** (102, hand-picked, will keep growing) — its pagination
  (`TargetsTable`, page size 10) and server-side filtering are the right
  shape to copy for Companies/Sessions once those have real volume too,
  rather than the "fetch everything, filter in the client" pattern
  Companies currently has (which happens to be moot right now, since
  nothing it fetches is real).
- **The daily-discover cron** (`leads`, real, 49 rows) is the one piece of
  this app already running against real scale considerations — worth
  checking its own rate limits/backoff against whatever source it scrapes
  before assuming it'll keep working unattended as `leads` grows well past
  49.

## 7. Phased order

1. **Fix Companies first** (§5.1) — it's the one page actively
   misrepresenting itself as working. Small, mechanical, high-trust-cost if
   left as-is.
2. **Overview's `supabaseReady()` branch** (§5.2) — same pattern as
   Library/Sessions, low risk, makes the ops team's actual front page real.
3. **Reconcile `onboarded_companies` ↔ `companies`** (§5.3) — do this
   before wiring `assessments` (§5.4), since an invitation needs a real
   `companies` row to belong to.
4. **`assessments` writer** (§5.4) — coordinate with
   `CANDIDATE_BACKEND_PLAN.md` §6.1–6.2; this is one feature built from two
   ends, not two separate features.
5. **Resend** (§5.5) — independent of the above, can happen any time
   someone has the API key.
6. **Realtime on Sessions** (§6, second bullet) — once `sessions` has real
   rows worth watching, not before.

## 8. Decisions this needs from you before it can go further

- **Whether `onboarded_companies` gets absorbed into `companies` outright,
  or the two stay separate and linked.** Both are defensible; the wrong
  outcome is what exists today, where they're separate and *not* linked.
- **Company Portal timeline** (PRD §1.4, not started) — Companies page
  becoming real doesn't require the Company Portal to exist, but a
  `companies` row with no login anywhere is only half the point of the
  table. Worth knowing whether that's the next portal after the candidate
  gate work, or stays ops-only (internal admin creates/manages companies
  on their behalf) for longer.
- **Backend hosting + email**, same two open items
  `CANDIDATE_BACKEND_PLAN.md` closes with — they're shared infrastructure,
  not per-app decisions.
