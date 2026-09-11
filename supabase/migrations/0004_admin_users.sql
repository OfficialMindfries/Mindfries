-- Mindfries — who is allowed into the internal admin.
--
-- Until now /admin was open: the login page pushed straight to /admin without
-- checking anything, and there was no middleware. This table is the list of
-- people who may sign in.
--
-- Passwords are never stored. Each row keeps a scrypt hash with its own random
-- salt, written by scripts/admin.mts — the database never sees the password,
-- and neither does anyone reading this table.
--
-- One account is deliberately NOT in here: ROOT_ADMIN_EMAIL from the
-- environment is always allowed, so an empty or broken table can't lock
-- everyone out of their own admin panel.
--
-- Apply after 0003_targets.sql.

create extension if not exists "pgcrypto";

create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  -- Stored lower-cased; the app lower-cases before every lookup, and the
  -- unique index below makes "Ada@x.com" and "ada@x.com" the same account.
  email         text not null,
  name          text not null,
  -- scrypt: "scrypt$N$r$p$<salt-b64>$<hash-b64>". Self-describing, so the
  -- parameters can be raised later without stranding existing rows.
  password_hash text not null,
  role          text not null default 'admin',   -- admin|viewer
  status        text not null default 'active',  -- active|disabled
  -- Throttling lives on the row so it survives a restart and works across
  -- however many server instances there are.
  failed_attempts int not null default 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists admin_users_email_key on admin_users (lower(email));
create index if not exists admin_users_status_idx on admin_users (status);
