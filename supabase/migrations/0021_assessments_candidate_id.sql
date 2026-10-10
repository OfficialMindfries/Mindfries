-- Mindfries — link assessments to the signed-in candidate who owns them.
--
-- Apply after 0020_session_revocation_and_login_throttle.sql.
--
-- This allows per-candidate invitation tracking and ensures every assessment
-- can be traced back to the account that started it.

alter table assessments
  add column if not exists candidate_id uuid
    references candidate_users(id) on delete set null;

create index if not exists assessments_candidate_idx on assessments (candidate_id);