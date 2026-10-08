-- Mindfries — what the candidate account was missing: a confirmed email, a
-- way back in after a forgotten password, the text of the resume, and what
-- can be read about the candidate from the accounts they linked.
--
-- Additive only. Apply after 0017_task_generation.sql.

alter table candidate_users
  -- When the candidate proved they receive mail at this address: by opening
  -- the link sent at sign-up, by resetting a password through one, or by
  -- signing in through a provider that vouches for the address. Null means
  -- nobody has checked — accounts older than this migration stay null rather
  -- than being marked as something that never happened.
  add column if not exists email_verified_at timestamptz,
  -- The resume as plain text, and the handful of fields read out of it
  -- (candidate/frontend/src/lib/profile/resume-fields.ts). The file itself
  -- stays in the `resumes` bucket; this is what makes it searchable and
  -- readable beside the report.
  add column if not exists resume_text text,
  add column if not exists resume_parsed jsonb,
  add column if not exists resume_parsed_at timestamptz;

-- One-time links sent by email: 'verify' confirms an address, 'reset' sets a
-- new password. Only a hash of the token is stored, so reading this table
-- doesn't hand anyone a working link.
create table if not exists candidate_auth_tokens (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidate_users(id) on delete cascade,
  kind         text not null,              -- verify|reset
  token_hash   text not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists candidate_auth_tokens_hash_key on candidate_auth_tokens (token_hash);
create index if not exists candidate_auth_tokens_candidate_idx on candidate_auth_tokens (candidate_id, kind, created_at desc);

-- What a linked account says about the candidate: projects, languages and
-- recent activity, one row per source. `verified` is false while the data is
-- only the public profile of a username the candidate typed — true once the
-- candidate has signed in to that account to prove it is theirs.
create table if not exists candidate_knowledge (
  candidate_id uuid not null references candidate_users(id) on delete cascade,
  source       text not null,              -- github|gitlab
  handle       text not null,
  verified     boolean not null default false,
  payload      jsonb not null default '{}',
  fetched_at   timestamptz not null default now(),
  primary key (candidate_id, source)
);

alter table candidate_auth_tokens enable row level security;
alter table candidate_knowledge enable row level security;
