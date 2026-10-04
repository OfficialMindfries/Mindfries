# Mindfries company backend

The Company Portal's Application API — roles, candidate pipeline, team, and
billing — the company-side counterpart to [`candidate/backend`](../../candidate/backend)'s
own Application API. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for why
this exists now (it's a deliberate exception to that doc's "CRUD stays in
Next" default, made explicit there).

It shares one Supabase Postgres database with `company/frontend` and
validates the same signed `mf_company` session cookie that app issues — it
does not mint sign-in sessions itself; sign-in stays where the password
hashing already lives (`company/frontend/lib/auth`).

## Status: Phase 8 — remaining open items

Closed out everything left in `IMPLEMENTATION.md` §12 and the two feature
gaps found while auditing what's left for the Company Portal: changing an
existing teammate's role (`PATCH /api/v1/team/{id}` now takes `role` as
well as `status`, sharing one "can't leave zero active admins" guard
between both), and closing/reopening a role (`PATCH /api/v1/roles/{id}` now
takes `status` as well as `templateId`). The permission matrix (§10) and
`/roles/new`'s visibility default were doc-only decisions, not code.

Also: verifying `Dockerfile` actually builds surfaced a real bug —
`golang:1.24-alpine` is older than `go.mod`'s `go 1.25.0` requirement, which
would fail with `go.mod requires go >= 1.25.0` the moment anyone tried to
build the image. Fixed to `golang:1.25-alpine`, confirmed by reproducing the
exact failure with `GOTOOLCHAIN=go1.24.0` and then confirming a clean build
with `go1.25.0` — no Docker daemon was available in this sandbox to run the
actual `docker build`, so that specific command is still a manual follow-up
wherever Docker is available, noted honestly rather than claimed as done.

## Status: Phase 7 — closing the API-completeness gaps

Phases 1–6 built the foundation, roles/candidates/team CRUD, Stripe billing
compute, the `COMPANY_BACKEND_URL`-gated billing-only frontend integration,
and full verification + docs. Checking the Phase 2 claim of mirroring
`company/frontend/lib/db.ts` "function for function" against the actual
frontend code turned up three real gaps — `ActionCandidateInvite` was
defined in the permission matrix but no route ever used it — closed in
Phase 7: inviting a candidate to a role (a two-table write: `assessments`
then `candidate_applications`), bulk stage change, and the dashboard's
upcoming-due-dates list. A fourth, lower-priority item (`listPublishedTemplates`,
the template picker) was added alongside them since it was cheap, not
because it was risky to skip.

`company/frontend` still only calls the billing routes (see Phase 5 below)
— these new routes round out the backend's own API surface and make
`ActionCandidateInvite` finally mean something, they don't change what the
frontend calls today.

## Status: Phase 5 — frontend integration (billing only)

Scoped to billing only, not roles/candidates/team: those are already real,
working Supabase CRUD in `lib/db.ts` with no behavioral difference this
service's equivalent routes would add, matching the one precedent already in
this repo for backend-gating (`internal-admin`'s `resetSession`/
`retriggerEval` only gate the two actions where the Supabase-only version is
a lesser fallback, never plain CRUD) and `ARCHITECTURE.md`'s own stated
reasoning against routing identical CRUD through an extra network hop.

New migration: [`0013_company_billing.sql`](../../supabase/migrations/0013_company_billing.sql)
adds `companies.stripe_customer_id`/`stripe_subscription_id` and a
`stripe_webhook_events` idempotency table (Stripe's webhooks are
at-least-once delivery; a replayed event must never double-apply a
plan/seat change).

**Invite email stays in Next.** This service only creates the `invited`
`company_users` row. Signing the one-time invite link and sending it via
Resend stays in `company/frontend` (`lib/auth/invite-token.ts` +
`lib/mailer.ts`, already shipped) — moving that here would mean duplicating
`COMPANY_INVITE_SECRET` and the Resend API key across two services for no
behavioral gain.

Verified end to end against a real local Postgres with signed test
webhooks (Stripe's own `GenerateTestSignedPayload` helper, no live Stripe
account needed for this): `checkout.session.completed` writes
`stripe_customer_id`/`stripe_subscription_id`, `customer.subscription.updated`
re-derives plan+seats from the subscription's price/quantity,
`customer.subscription.deleted` reverts the plan to `trial`, a replayed
event id is a no-op, and `billing:manage` correctly gates even the read
(permissions.ts marks billing admin-only to view, not just change). That
pass caught two more real bugs, now fixed:

- `PlanForPrice("")` matched whichever plan slot (Starter/Growth/Enterprise)
  happened to be left unconfigured, because an empty Stripe Price ID
  compared equal to an empty config value. Caught by this package's own
  test suite before it ever reached a webhook.
- `webhook.ConstructEvent` rejects an otherwise-validly-signed event when
  its API version doesn't match the exact version stripe-go was compiled
  against — which a real Stripe Dashboard webhook endpoint, configured
  independently, routinely won't. Switched to
  `ConstructEventWithOptions(..., IgnoreAPIVersionMismatch: true)`: the
  signature is what proves authenticity, not the version string.

Verified end to end against a real local Postgres (migrations
`0002_product.sql` + `0011_company_portal.sql` applied, every route
exercised over HTTP with signed test cookies) — not just unit tests. That
pass caught and fixed two real bugs: `internal/db.New` dereferencing a nil
`TLSConfig` when the connection string doesn't request TLS, and
`timestamptz` columns needing to be scanned into `time.Time` rather than
`string` under pgx's binary protocol (both fixed in `internal/db`).

Phase 7's four new routes were verified the same way — a published
template seeded, a role created and attached to it, a candidate invited
(confirmed the `assessments` row carries the role's `template_id`/`title`
and the linked `candidate_applications` row lands with `stage: "invited"`),
a bulk stage change across two candidates, the due-dates list returning the
invited candidate's date, and cross-company isolation confirmed on both the
invite and due-dates routes (a different company's cookie gets a 404 or an
empty list, never someone else's data). No new bugs found this round.

## Run it

```bash
cp .env.example .env.local   # then fill in DATABASE_URL and COMPANY_SESSION_SECRET
go run ./cmd/server
```

`DATABASE_URL` is the same value `company/frontend/.env.local` uses.
`COMPANY_SESSION_SECRET` must be the *exact* `SESSION_SECRET` value from
`company/frontend/.env.local` — this service verifies signatures that app
makes, it doesn't generate its own.

```bash
go test ./...      # unit tests — cover validation/permission logic, not live queries
go vet ./...
gofmt -l .          # should print nothing
```

Unit tests don't hit a live database (no `DATABASE_URL` is assumed to be
available to the test binary — same constraint `candidate/backend`'s own
suite lives with). The real query layer (`internal/db`) is verified by
running the service against an actual Postgres, same as the manual check
described in Status above.

## Endpoints

| Method & path | Gate | What it does |
|---|---|---|
| `GET /health`, `GET /status` | none | Liveness, DB ping, which integrations have keys |
| `GET /api/v1/roles` | any role | List job roles + per-role stage counts |
| `POST /api/v1/roles` | `role:write` | Create a role |
| `GET /api/v1/roles/{id}` | any role | Role detail + full pipeline |
| `PATCH /api/v1/roles/{id}` | `role:write` | Attach/change a role's template, and/or open ↔ closed status |
| `GET /api/v1/candidates` | any role | Cross-role candidate list |
| `GET /api/v1/candidates/compare?ids=` | any role | 2–4 candidate comparison rows |
| `GET /api/v1/candidates/{id}` | any role | Candidate profile + section scores |
| `GET /api/v1/candidates/due-dates` | any role | Upcoming assessment due dates, soonest first |
| `POST /api/v1/candidates/{id}/stage` | `candidate:stage` | Shortlist / reject / hire |
| `POST /api/v1/roles/{roleId}/candidates` | `candidate:invite` | Invite a candidate (writes `assessments` + `candidate_applications`) |
| `POST /api/v1/roles/{roleId}/candidates/bulk-stage` | `candidate:stage` | Shortlist / reject / hire several candidates at once |
| `GET /api/v1/templates` | any role | Published Game Library templates (for role/template pickers) |
| `GET /api/v1/team` | any role | Team roster |
| `POST /api/v1/team/invite` | `team:manage` | Create an `invited` row (email sent by Next, see above) |
| `PATCH /api/v1/team/{id}` | `team:manage` | Activate/disable a teammate, and/or change their role |
| `GET /api/v1/billing` | `billing:manage` | Plan, seats, usage (admin-only to view, not just change) |
| `POST /api/v1/billing/checkout-session` | `billing:manage` | Stripe Checkout Session for a plan/seat change |
| `POST /api/v1/billing/portal-session` | `billing:manage` | Stripe Billing Portal link |
| `POST /api/v1/webhooks/stripe` | Stripe-Signature header, no cookie | Verifies signature + replay guard, applies plan/seats |

This is the full route table (Phases 1–8 all merged in).

## Permissions

`internal/httpapi/permissions.go` ports `company/frontend/lib/auth/permissions.ts`'s
`can(action, role)` matrix verbatim — same action names, same role lists.
If that file changes, this one must change with it; there is no other source
of truth for who can do what.

## Deploying

Not deployed anywhere yet — same "waiting on a decision" status
`candidate/backend`'s own README documents for itself. What follows is
platform-agnostic (Docker-based), so it applies whether the eventual host is
Fly.io, Render, Railway, a bare VPS, or anything else that runs a container
and lets you set environment variables.

1. **Build the image**: `docker build -t company-backend .` from this
   directory. The `Dockerfile` is a two-stage build (`golang:1.25-alpine` →
   `alpine:3.20`) — the final image is just the compiled binary plus CA
   certificates, nothing else.
2. **Environment variables**: every host needs the same variables
   `.env.example` documents — `DATABASE_URL` and `COMPANY_SESSION_SECRET`
   are required (the process refuses to start without them); `PORT`
   defaults to `8081` if the host doesn't set its own; `ALLOWED_ORIGINS` and
   `COMPANY_FRONTEND_URL` should point at wherever `company/frontend` is
   actually deployed, not `localhost`; the `STRIPE_*` variables are optional
   (see "Setting up Stripe" below) but billing answers "not configured"
   without them.
3. **Health check**: `GET /health` — pure liveness, no database call, so a
   load balancer can use it even while Postgres is briefly unreachable.
   `GET /status` additionally reports real DB connectivity and which
   optional integrations have keys, useful for a one-off check but not as a
   load balancer's health check (it does make a database round trip).
4. **The only change on the frontend side**: once this service has a real
   URL, set `COMPANY_BACKEND_URL` in `company/frontend`'s environment to
   that URL. Nothing else changes — the billing buttons on
   `/settings/billing` start working the moment that variable (and a real
   Stripe account, below) are both in place; every other screen in
   `company/frontend` is unaffected either way.

## Setting up Stripe

Also not done yet — no real Stripe account exists for this project. When
one does, here's exactly what it needs:

1. **Create one Price per paid plan** in the Stripe Dashboard (Products →
   add a product per plan, a recurring Price on each): Starter, Growth,
   Enterprise. Each Price's id (`price_...`) goes into this service's
   `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_ENTERPRISE`
   — `internal/billing/plans.go`'s `PlanPrices` is the only place that
   mapping is read from.
2. **Register a webhook endpoint** pointing at
   `https://<wherever-this-is-deployed>/api/v1/webhooks/stripe`, subscribed
   to exactly three events: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted` — the
   only three `internal/httpapi/webhook.go` currently handles (anything
   else is acknowledged and ignored, not an error).
3. **Copy the webhook's signing secret** (shown once, in the endpoint's
   details in the Dashboard) into `STRIPE_WEBHOOK_SECRET`, and the account's
   secret key into `STRIPE_SECRET_KEY`. Test mode first — everything here
   works identically in test and live mode, Stripe just uses different
   keys/Prices for each.
4. **No code changes needed** for any of this — it's all environment
   configuration against the service as it already exists.

## Known gaps worth tracking

- Not deployed anywhere, and no real Stripe account — see the two sections
  above.
- `company/frontend` only calls the billing routes (see Phase 5) — roles,
  candidates, and team CRUD stay direct-Supabase on the frontend side, by
  design.
