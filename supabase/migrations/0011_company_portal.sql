-- Mindfries — Company Portal foundation (IMPLEMENTATION.md §7).
--
-- Three tables the Company Portal needs that nothing before it created:
--
-- - company_users: real per-user company accounts with credentials.
--   companies.team (0002_product.sql) is a jsonb [{email, role}] blob with
--   no password — it can't back a login, only display a list. This table is
--   what a Company Portal session actually authenticates against.
-- - job_roles: the entity `assessments` never had. Today `assessments`
--   conflates "a role" and "one candidate's invite" into a single row
--   (company_id, template_id, candidate_email, status, match_score) — there
--   is no entity for a role with many candidates in a pipeline.
-- - candidate_applications: one candidate's place in one role's pipeline —
--   what the dashboard's per-role stage counts (IMPLEMENTATION.md §9) read
--   from. `assessments` stays exactly as it is (the invite/session record
--   the candidate app already writes); this is the new row that groups many
--   candidates under one role.

create table if not exists company_users (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  email           text not null,
  name            text not null,
  password_hash   text not null default '', -- empty until the invite is completed; never matches verifyPassword's "scrypt$..." format
  role            text not null default 'recruiter', -- admin|recruiter|viewer
  status          text not null default 'invited',    -- invited|active|disabled
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists company_users_email_idx on company_users (lower(email));
create index if not exists company_users_company_idx on company_users (company_id);

create table if not exists job_roles (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  template_id  uuid references game_templates(id) on delete set null,
  title        text not null,
  tech_stack   text[] not null default '{}',
  duration_min int,                                    -- override of the template's own duration; null means "use the template's"
  visibility   text not null default 'invite_only',     -- invite_only|open_pool
  status       text not null default 'open',            -- open|closed
  created_at   timestamptz not null default now()
);
create index if not exists job_roles_company_idx on job_roles (company_id);

create table if not exists candidate_applications (
  id              uuid primary key default gen_random_uuid(),
  job_role_id     uuid not null references job_roles(id) on delete cascade,
  assessment_id   uuid references assessments(id) on delete set null,
  candidate_name  text,
  candidate_email text not null,
  stage           text not null default 'invited', -- invited|in_progress|completed|shortlisted|rejected|hired
  score           int,
  section_scores  jsonb not null default '{}',
  time_taken_min  int,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists candidate_applications_role_idx on candidate_applications (job_role_id);
create index if not exists candidate_applications_stage_idx on candidate_applications (stage);
