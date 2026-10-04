# Architecture

## Apps
- **candidate/** — what candidates use. `frontend/` (Next.js) + `backend/` (Go —
  the Application API/Orchestrator/Admin Portal API, confirmed Go 2026-09-12;
  replaces an earlier FastAPI skeleton entirely).
- **internal-admin/** — Mindfries-team ops portal. `frontend/` (Next.js) +
  `backend/` (planned, not built yet).
- **company/** — the Company Portal. `frontend/` (Next.js) + `backend/` (Go —
  roles/candidates/team CRUD plus real Stripe billing; see below).

## Data & interaction (decision)
**Supabase (Postgres) is the single system of record and the interaction layer.**
All three frontends read/write shared tables **server-side only** (service-role
key, never in the browser). This is how the apps talk — no direct app-to-app
calls for CRUD.

- `supabase/migrations/0001_tracker.sql` — internal-admin lead/growth pipeline.
- `supabase/migrations/0002_product.sql` — shared product schema: `companies`,
  `game_templates`, `assessments`, `sessions`.
- `supabase/migrations/0011_company_portal.sql` — `company_users`, `job_roles`,
  `candidate_applications` (the Company Portal's own entities).
- `supabase/migrations/0013_company_billing.sql` — `companies.stripe_customer_id`/
  `stripe_subscription_id` + the `stripe_webhook_events` idempotency table.

**A backend is for compute, not CRUD.** It earns its place only where Supabase
can't: sandbox orchestration, the evaluation pipeline, the Gemini Live
interviewer (`candidate/backend`) — and, as of `company/backend`, real Stripe
billing (checkout, the billing portal, and a signature-verified webhook that
syncs `companies.plan`/`seats`). Everywhere else, CRUD and reads go straight to
Supabase from each Next app's server layer (`lib/db.ts`).

`company/backend` goes further than `candidate/backend` did at first: it also
exposes real CRUD routes for roles, candidates, and team (mirroring
`company/frontend/lib/db.ts` function for function) — a deliberate, scoped
exception to "CRUD stays in Next", requested directly rather than discovered
as a compute need. `company/frontend` does **not** call those CRUD routes
today; only the billing routes are wired up (`lib/backend/client.ts`,
`COMPANY_BACKEND_URL`-gated — the same fallback shape
`internal-admin/frontend/lib/backend/client.ts` already uses for its own
`ADMIN_BACKEND_URL`). Routing already-correct, already-working CRUD through
an extra network hop for identical behavior is exactly what "Why not a
backend monolith" (below) argues against — so the roles/candidates/team
routes exist and are tested, but company/frontend keeps reading/writing
Supabase directly for them, same as every other screen in the app.

### The loop
```
admin authors template (game_templates, published)
   └─► candidate dashboard reads published templates
          └─► candidate starts one  → writes a sessions row (status=live)
                 └─► admin Session Monitor reads sessions live; reset / re-trigger eval
```

## Why not a backend monolith for everything now
Supabase already provides auth, row-level security, realtime, and a Postgres API.
Duplicating that in a backend service to move CRUD between Next apps adds a
deploy target and a network hop for no benefit (YAGNI) — true whether that
service is FastAPI (`internal-admin/backend`, still unbuilt) or Go
(`candidate/backend`, `company/backend`). The `lib/db.ts` seam in each app
keeps the door open to move specific reads/writes behind a backend later
without touching the UI — `company/backend`'s billing routes are that door,
opened for the one case (Phase 4) that actually needed it.
