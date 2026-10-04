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

## Status: Phase 1 — scaffold only

This is the foundation: config, database connection, session verification,
the permission matrix ported from `company/frontend/lib/auth/permissions.ts`,
and `/health`/`/status`. No business routes yet — those land in Phases 2–4
(see the project's implementation plan). `company/frontend` does not call
this service yet; every `lib/db.ts` function still reads/writes Supabase
directly until Phase 5 adds the `COMPANY_BACKEND_URL`-gated client, mirroring
how `internal-admin/frontend` falls back to direct Supabase when
`ADMIN_BACKEND_URL` is unset.

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
go test ./...      # unit tests — no live database needed yet (Phase 1 has none)
go vet ./...
gofmt -l .          # should print nothing
```

## Endpoints

| Method & path | Auth | What it does |
|---|---|---|
| `GET /health` | none | Liveness only |
| `GET /status` | none | Real DB ping + whether Stripe/webhook secret are configured |

The full route table (roles, candidates, team, billing) is documented in the
project's implementation plan and lands incrementally through Phases 2–4;
this table is kept up to date as each phase merges.

## Permissions

`internal/httpapi/permissions.go` ports `company/frontend/lib/auth/permissions.ts`'s
`can(action, role)` matrix verbatim — same action names, same role lists.
If that file changes, this one must change with it; there is no other source
of truth for who can do what.

## Known gaps worth tracking

- Not deployed anywhere yet — same "waiting on a decision" status
  `candidate/backend`'s own README documents for itself.
- `company/frontend` isn't calling this service yet (see Status above).
