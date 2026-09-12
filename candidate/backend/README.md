# Mindfries candidate backend

The Application API, Assessment Orchestrator, and Admin Portal API from
[`System_Archetect_And_PRD.md`](../../System_Archetect_And_PRD.md) §2.3 —
confirmed Go, 2026-09-12. Replaces the earlier FastAPI skeleton entirely (no
Python in this service).

It shares one Supabase Postgres database with `candidate/frontend` and
`internal-admin/frontend` and validates the same signed session cookies
those two apps issue — it does not mint sign-in sessions itself; sign-in
stays where the password hashing already lives (each app's `lib/auth`).

## Status: real, not wired up to the frontends yet

Every endpoint below does what it says against the live database — it is
not a mock. What it is **not** yet is *connected*: neither Next.js app calls
this service today. `candidate/frontend` still reads and writes Supabase
directly for the assessments/sessions it already handles (`src/lib/db.ts`);
`internal-admin/frontend` still does the same for its Global Session Monitor
(`lib/db.ts`). Pointing either app at this API instead is a separate,
follow-up integration step.

Two integrations are genuinely unfinished, and say so rather than fake it:

- **The AI Interview agent** (`internal/llm/gemini_live.go`) — Gemini's Live
  API needs a real-time bidirectional-audio WebSocket bridge between a
  candidate's browser and Gemini. That bridge doesn't exist yet; every call
  returns `ErrInterviewNotImplemented`, configured or not.
- **Sandbox provisioning** (`internal/sandbox/daytona.go`) — `CreateSandbox`
  and `ExecuteCommand` are real HTTP calls against Daytona's documented REST
  routes; `DeleteSandbox` assumes the general `DELETE /sandbox/{id}`
  convention but wasn't directly confirmed against Daytona's docs while
  writing this — verify it (or use Daytona's SDK) before relying on cleanup.

Everything else — session lifecycle, telemetry ingestion, the four
OpenRouter-backed evaluation agents, the report pipeline, the admin support
overrides, the real-time hub — runs for real. It was smoke-tested end to end
against the live Supabase project while building it (start a session, post
events, submit, watch a report come back — as an honest `failed` status with
no `OPENROUTER_API_KEY` set, exactly as it should).

## Run it

```bash
cp .env.example .env.local   # then fill in DATABASE_URL and both session secrets
go run ./cmd/server
```

`DATABASE_URL` is the same value `candidate/frontend/.env.local` uses.
`CANDIDATE_SESSION_SECRET` and `ADMIN_SESSION_SECRET` must be the *exact*
`SESSION_SECRET` values from `candidate/frontend/.env.local` and
`internal-admin/frontend/.env.local` respectively — this service verifies
signatures those apps make, it doesn't generate its own.

```bash
go test ./...      # unit tests — no live database needed
go vet ./...
gofmt -l .          # should print nothing
```

## Endpoints

All JSON. Candidate routes require the `mf_candidate` cookie
(`candidate/frontend` issues it); admin routes require `mf_admin`
(`internal-admin/frontend` issues it). Neither cookie is accepted by the
other's routes — see `internal/session`'s tests for exactly what that
isolation guards against.

| Method & path | Auth | What it does |
|---|---|---|
| `GET /health` | none | Liveness only |
| `GET /status` | none | Real DB ping + which integrations have keys |
| `GET /api/v1/me` | candidate | Identity from the session cookie |
| `GET /api/v1/assessments` | candidate | Published templates, same shape as the old `listAvailableAssessments` |
| `POST /api/v1/assessments/{templateId}/sessions` | candidate | Starts a session — real `candidate_id` FK, not just a name |
| `GET /api/v1/sessions/{id}` | candidate (owner) | Session status |
| `POST /api/v1/sessions/{id}/events` | candidate (owner) | Telemetry ingestion (PRD §1.7) — nothing calls this from the IDE yet |
| `POST /api/v1/sessions/{id}/submit` | candidate (owner) | Ends the session, runs evaluation in the background |
| `GET /api/v1/sessions/{id}/report` | candidate (owner) | Poll for the report; `pending` → `generating` → `ready`/`failed` |
| `GET /api/v1/sessions/{id}/ws` | candidate (owner) | Live event/status stream for that session |
| `GET /api/v1/admin/sessions` | admin | Global Session Monitor feed |
| `GET /api/v1/admin/sessions/{id}/ws` | admin | Same live stream, admin side, any session |
| `POST /api/v1/admin/sessions/{id}/reset` | admin | Support override — reset a stuck session |
| `POST /api/v1/admin/sessions/{id}/retrigger-evaluation` | admin | Support override — re-run the evaluation pipeline |

## The AI Intelligence Layer

`internal/llm` implements PRD §1.9's four non-interview agents (Code
Evaluation, Reasoning, Workflow, Report) as separate OpenRouter calls with
their own system prompts — not one giant prompt. Per-agent model routing is
still the open PRD §2.4 item; every agent defaults to
`anthropic/claude-sonnet-4.5` and can be overridden independently via
`OPENROUTER_MODEL_CODE_EVAL` / `_REASONING` / `_WORKFLOW` / `_REPORT` the
moment that routing is confirmed.

The Report agent is asked for strict JSON
(`{"recommendation", "summary"}`); if a model wraps it in a markdown fence
that gets stripped, and if it isn't parseable JSON at all the raw reply is
kept as the summary rather than discarded — a real response beats a
formatting-triggered failure.

## Database

New migration: [`supabase/migrations/0006_events_and_reports.sql`](../../supabase/migrations/0006_events_and_reports.sql)
— adds `activity_events`, `assessment_reports`, `evidence_items`, and a
nullable `candidate_id` on `sessions`. Apply it with either frontend's
`npm run migrate` (shared `schema_migrations` bookkeeping, same as every
migration before it).

## Known gaps worth tracking

- Neither frontend calls this service yet (see "Status" above).
- No telemetry is actually posted to `/sessions/{id}/events` by the IDE —
  until `candidate/frontend/src/app/ide` is wired to send it, the Reasoning
  and Workflow agents will honestly report "no evidence" on every real
  submission.
- `internal-admin`'s `admin_users.role` (`admin` | `viewer`) is verified for
  shape but not enforced as permission tiers here — neither is it enforced
  anywhere in `internal-admin/frontend` today, so this matches existing
  behavior rather than inventing new policy. Worth deciding once viewer vs.
  admin distinctions actually matter.
- Daytona's `DELETE /sandbox/{id}` route (see above) needs confirming.
