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

## Status: Phase 3 — Team API

Phases 1–2 laid the foundation and the roles/candidates surface. Phase 3
adds the team roster: list, invite, and activate/disable a teammate, backed
by real queries against `company_users`. Billing (Phase 4) is still to
come. `company/frontend` does not call this service yet; every `lib/db.ts`
function still reads/writes Supabase directly until Phase 5 adds the
`COMPANY_BACKEND_URL`-gated client, mirroring how `internal-admin/frontend`
falls back to direct Supabase when `ADMIN_BACKEND_URL` is unset.

**Invite email stays in Next.** This service only creates the `invited`
`company_users` row. Signing the one-time invite link and sending it via
Resend stays in `company/frontend` (`lib/auth/invite-token.ts` +
`lib/mailer.ts`, already shipped) — moving that here would mean duplicating
`COMPANY_INVITE_SECRET` and the Resend API key across two services for no
behavioral gain.

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

Billing routes land in Phase 4; this table is kept up to date as each phase
merges.

## Permissions

`internal/httpapi/permissions.go` ports `company/frontend/lib/auth/permissions.ts`'s
`can(action, role)` matrix verbatim — same action names, same role lists.
If that file changes, this one must change with it; there is no other source
of truth for who can do what.

## Known gaps worth tracking

- Not deployed anywhere yet — same "waiting on a decision" status
  `candidate/backend`'s own README documents for itself.
- `company/frontend` isn't calling this service yet (see Status above).
