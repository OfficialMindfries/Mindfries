-- Mindfries — candidate accounts.
--
-- Self-serve: a candidate creates their own row via the signup form (unlike
-- admin_users, which only the CLI can add). Same shape as admin_users
-- (0004_admin_users.sql) for the same reasons — a scrypt hash with its own
-- salt, never the password itself, and throttling fields that live on the
-- row so they survive a restart and work across however many server
-- instances there are.
--
-- Apply after 0004_admin_users.sql.

create extension if not exists "pgcrypto";

create table if not exists candidate_users (
  id              uuid primary key default gen_random_uuid(),
  -- Stored lower-cased; the app lower-cases before every lookup, and the
  -- unique index below makes "Ada@x.com" and "ada@x.com" the same account.
  email           text not null,
  name            text not null,
  password_hash   text not null,
  status          text not null default 'active',  -- active|disabled
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists candidate_users_email_key on candidate_users (lower(email));
create index if not exists candidate_users_status_idx on candidate_users (status);
