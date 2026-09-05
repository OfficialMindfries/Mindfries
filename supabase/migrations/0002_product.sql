-- Mindfries — shared product schema (the interaction layer between the
-- candidate app and the internal-admin app). Both apps read/write these tables
-- server-side via the Supabase service-role key; the browser never touches them.
-- Apply after 0001_tracker.sql in the officemindfries Supabase project.

create extension if not exists "pgcrypto";

-- Real company accounts (distinct from tracker's onboarded_companies, which is
-- the sales pipeline; a won lead graduates into a row here).
create table if not exists companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  website              text,
  plan                 text not null default 'trial',    -- trial|starter|growth|enterprise
  status               text not null default 'active',   -- onboarding|active|paused
  seats                int  not null default 5,
  team                 jsonb not null default '[]',      -- [{email, role}]
  default_template_ids uuid[] not null default '{}',
  created_at           timestamptz not null default now()
);

-- The shared Assessment/Game Library — authored by Mindfries ops in internal-admin,
-- consumed by candidates in the candidate app.
create table if not exists game_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  task_variant      text not null,                       -- bug_fix|feature|refactor|debug
  repo_template     text,
  tech_stack        text[] not null default '{}',
  duration_min      int  not null default 60,
  interviewer_prompt text,
  rubric            jsonb not null default '[]',         -- [{id,label,weight}]
  status            text not null default 'draft',       -- draft|published
  created_at        timestamptz not null default now()
);

-- A candidate invited to run a specific template for a specific company.
create table if not exists assessments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  template_id    uuid references game_templates(id) on delete set null,
  candidate_name text,
  candidate_email text not null,
  role           text,
  status         text not null default 'invited',        -- invited|in_progress|submitted|closed
  due_date       date,
  match_score    int,
  created_at     timestamptz not null default now()
);
create index if not exists assessments_email_idx on assessments (lower(candidate_email));

-- One candidate's live/past run — written by the candidate app when a session
-- starts, monitored (and support-actioned) by internal-admin.
create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid references assessments(id) on delete set null,
  company_id     uuid references companies(id) on delete set null,
  template_id    uuid references game_templates(id) on delete set null,
  candidate_name text,
  status         text not null default 'live',           -- live|submitted|evaluating|completed|stuck|failed
  sandbox_health text not null default 'healthy',        -- healthy|degraded|error
  progress_pct   int  not null default 0,
  duration_min   int  not null default 60,
  elapsed_min    int  not null default 0,
  started_at     timestamptz not null default now()
);
create index if not exists sessions_status_idx on sessions (status);
create index if not exists sessions_started_idx on sessions (started_at desc);
