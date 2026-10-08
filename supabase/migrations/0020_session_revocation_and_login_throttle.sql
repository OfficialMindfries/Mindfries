-- Signing a candidate out everywhere, and slowing down guessing by network.
--
-- A candidate's session is a signed cookie that is good for 14 days and, until
-- now, could not be withdrawn: a password reset left every other signed-in
-- browser signed in, and a copied cookie worked until it expired.
--
-- sessions_valid_from is the moment before which this account's sessions no
-- longer count. Each cookie now carries when it was issued; one issued before
-- this moment (or carrying no issue time at all — every cookie from before
-- this change) is refused. Null means nothing has been withdrawn. It is set
-- by a password reset and by "sign out of all devices".
alter table candidate_users add column if not exists sessions_valid_from timestamptz;

-- Attempts at the public account forms (sign-in failures, sign-ups, reset
-- requests), by the network they came from. The per-account lock stops
-- guessing at one account; this stops one network working through many.
-- ip_hash is a keyed hash of the address — the address itself isn't stored.
-- Rows are only useful for an hour or so and are cleared as new ones arrive.
create table if not exists candidate_auth_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  kind text not null check (kind in ('login', 'signup', 'reset')),
  at timestamptz not null default now()
);

create index if not exists candidate_auth_attempts_recent on candidate_auth_attempts (ip_hash, kind, at desc);

-- Server-side only (the service role), like the other candidate auth tables.
alter table candidate_auth_attempts enable row level security;
