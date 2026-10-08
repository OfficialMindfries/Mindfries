-- Mindfries — a candidate's answer to an invitation, what feeds their
-- notifications, and the two setup steps the dashboard asks for.
--
-- Additive only. Apply after 0018_candidate_account_and_knowledge.sql.

alter table assessments
  -- The candidate's answer. Accepting leaves status 'invited' (it is still
  -- theirs to start); declining sets status to 'declined', a value this
  -- column didn't have before — candidate/backend only starts a session for
  -- an invitation whose status is 'invited', so a declined one can't be
  -- started.
  add column if not exists accepted_at    timestamptz,
  add column if not exists declined_at    timestamptz,
  -- Optional, in the candidate's words, shown to the company.
  add column if not exists decline_reason text,
  -- When the invitation was mailed to the candidate. Null means no mail was
  -- sent (the company portal had no mail provider configured) — the
  -- invitation still exists and shows on the candidate's dashboard.
  add column if not exists invite_emailed_at timestamptz;

-- candidate_applications.stage likewise gains 'declined', set alongside the
-- assessment's status so the company's pipeline shows it.

alter table candidate_users
  -- The last environment check that passed: camera, microphone, and what
  -- the browser can do. `environment_check` is what the candidate's browser
  -- reported at that time — it is their browser's word, not a measurement
  -- taken by the server.
  add column if not exists environment_checked_at timestamptz,
  add column if not exists environment_check      jsonb;

-- One row per practice run a candidate opened. That it happened is all that
-- is kept: a practice run has no session, no events and no evidence.
create table if not exists practice_runs (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidate_users(id) on delete cascade,
  started_at   timestamptz not null default now()
);
create index if not exists practice_runs_candidate_idx on practice_runs (candidate_id, started_at desc);

-- Notifications themselves aren't stored: they are worked out from the
-- candidate's real records (an invitation, a due date, a finished report)
-- each time the bell is opened. What is stored is what the candidate did
-- with one — read it, or dismissed it — keyed by the notification's own
-- stable id (e.g. 'invite:<assessment id>').
create table if not exists candidate_notification_state (
  candidate_id uuid not null references candidate_users(id) on delete cascade,
  key          text not null,
  read_at      timestamptz,
  dismissed_at timestamptz,
  primary key (candidate_id, key)
);

alter table practice_runs enable row level security;
alter table candidate_notification_state enable row level security;
