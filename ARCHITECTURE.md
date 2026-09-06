# Architecture

## Apps
- **candidate/** — what candidates use. `frontend/` (Next.js) + `backend/` (FastAPI).
- **internal-admin/** — Mindfries-team ops portal. `frontend/` (Next.js) + `backend/` (FastAPI, to come).

## Data & interaction (decision)
**Supabase (Postgres) is the single system of record and the interaction layer.**
Both apps read/write shared tables **server-side only** (service-role key, never
in the browser). This is how the two apps talk — no direct app-to-app calls for CRUD.

- `supabase/migrations/0001_tracker.sql` — internal-admin lead/growth pipeline.
- `supabase/migrations/0002_product.sql` — shared product schema: `companies`,
  `game_templates`, `assessments`, `sessions`.

**FastAPI is for compute, not CRUD.** It earns its place only where Supabase
can't: sandbox orchestration, the evaluation pipeline, and the Gemini Live
interviewer. Until those exist, CRUD and reads go straight to Supabase from each
Next app's server layer (`lib/db.ts`).

### The loop
```
admin authors template (game_templates, published)
   └─► candidate dashboard reads published templates
          └─► candidate starts one  → writes a sessions row (status=live)
                 └─► admin Session Monitor reads sessions live; reset / re-trigger eval
```

## Why not a FastAPI monolith for everything now
Supabase already provides auth, row-level security, realtime, and a Postgres API.
Duplicating that in a Python service to move CRUD between two Next apps adds a
deploy target and a network hop for no benefit (YAGNI). The `lib/db.ts` seam in
each app keeps the door open to move specific reads/writes behind FastAPI later
without touching the UI.
