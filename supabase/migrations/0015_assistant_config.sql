-- Per-role settings for the workspace AI assistant: whether candidates for
-- the role get one at all, and how many messages they may send it.
-- Read by candidate/backend (internal/db/assistant.go), written by the
-- Company Portal's role page. An empty object means the defaults: on, with
-- the platform's own message ceiling.
alter table job_roles
  add column if not exists assistant_config jsonb not null default '{}'::jsonb;
