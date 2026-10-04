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

## Status: Phase 4 — Billing compute (Stripe)

Phases 1–3 laid the foundation and the roles/candidates/team surface —
CRUD, same as company/frontend's own `lib/db.ts` already does. Phase 4 adds
the one piece that's genuinely compute, not CRUD, per `ARCHITECTURE.md`'s
own carve-out: real Stripe billing. `company/frontend` does not call this
service yet; every `lib/db.ts` function still reads/writes Supabase
directly until Phase 5 adds the `COMPANY_BACKEND_URL`-gated client.

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
| `PATCH /api/v1/roles/{id}` | `role:write` | Attach/change a role's template |
| `GET /api/v1/candidates` | any role | Cross-role candidate list |
| `GET /api/v1/candidates/compare?ids=` | any role | 2–4 candidate comparison rows |
| `GET /api/v1/candidates/{id}` | any role | Candidate profile + section scores |
| `POST /api/v1/candidates/{id}/stage` | `candidate:stage` | Shortlist / reject / hire |
| `GET /api/v1/team` | any role | Team roster |
| `POST /api/v1/team/invite` | `team:manage` | Create an `invited` row (email sent by Next, see above) |
| `PATCH /api/v1/team/{id}` | `team:manage` | Activate / disable a teammate |
| `GET /api/v1/billing` | `billing:manage` | Plan, seats, usage (admin-only to view, not just change) |
| `POST /api/v1/billing/checkout-session` | `billing:manage` | Stripe Checkout Session for a plan/seat change |
| `POST /api/v1/billing/portal-session` | `billing:manage` | Stripe Billing Portal link |
| `POST /api/v1/webhooks/stripe` | Stripe-Signature header, no cookie | Verifies signature + replay guard, applies plan/seats |

This is the full route table (Phases 1–4 all merged in).

## Permissions

`internal/httpapi/permissions.go` ports `company/frontend/lib/auth/permissions.ts`'s
`can(action, role)` matrix verbatim — same action names, same role lists.
If that file changes, this one must change with it; there is no other source
of truth for who can do what.

## Known gaps worth tracking

- Not deployed anywhere yet — same "waiting on a decision" status
  `candidate/backend`'s own README documents for itself.
- `company/frontend` isn't calling this service yet (see Status above).
