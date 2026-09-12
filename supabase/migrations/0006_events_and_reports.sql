-- Mindfries — telemetry, evaluation evidence, and a real candidate/session
-- link. Written for the Go backend (System_Archetect_And_PRD.md §2.3 and
-- §1.10's data model) — the Assessment Orchestrator, Event & Telemetry
-- Engine, and Evaluation Engine read/write these.
--
-- Apply with either app's `npm run migrate` — one shared schema_migrations
-- table, filename order, same as every migration before this one.
--
-- Apply after 0005_candidate_users.sql.

create extension if not exists "pgcrypto";

-- A session now optionally belongs to a real signed-in candidate, not just a
-- free-text name. Nullable: nothing that writes `sessions` today sets it, so
-- existing rows and any admin-triggered session stay valid; the Go
-- orchestrator sets it going forward for every self-serve candidate session
-- (CANDIDATE_BACKEND_PLAN.md §5's "startSession() takes a candidate id").
alter table sessions add column if not exists candidate_id uuid references candidate_users(id) on delete set null;
create index if not exists sessions_candidate_idx on sessions (candidate_id);

-- PRD §1.7 evidence capture, §1.10 ACTIVITY_EVENT: every navigation, file
-- edit, git action, terminal command, test run and AI-assistant use the
-- workspace observes, one row per event. Append-only and expected to be the
-- highest-volume table in the schema — see the Go backend's own docs for the
-- Redis Streams buffer this is meant to sit behind once volume justifies it.
create table if not exists activity_events (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  event_type  text not null,             -- navigation|file_edit|git|terminal|test_run|ai_usage
  payload     jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index if not exists activity_events_session_idx on activity_events (session_id, occurred_at);

-- PRD §1.10 ASSESSMENT_REPORT / EVIDENCE_ITEM: one report per session,
-- assembled by the Report agent from the other agents' evidence.
create table if not exists assessment_reports (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null unique references sessions(id) on delete cascade,
  status         text not null default 'pending',  -- pending|generating|ready|failed
  recommendation text,                              -- strong_hire|hire|lean_no|no_hire
  summary        text,
  error          text,                              -- set when status = failed, the honest reason why
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists evidence_items (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references assessment_reports(id) on delete cascade,
  category    text not null,          -- code_evaluation|reasoning|workflow|interview
  observation text not null,
  created_at  timestamptz not null default now()
);
create index if not exists evidence_items_report_idx on evidence_items (report_id);
