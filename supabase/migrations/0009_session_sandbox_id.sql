-- Mindfries — remember which Daytona sandbox belongs to which session.
--
-- CreateSandbox's response (candidate/backend/internal/sandbox/daytona.go)
-- was being discarded entirely: nothing stored the ID it returned, so once
-- a real DAYTONA_API_KEY exists, provisioning would create a real, billable
-- sandbox with no way to ever find it again to tear it down. This column is
-- the other half of that fix — DeleteSandbox needs an ID to delete.
--
-- Nullable: most sessions have none (Daytona unconfigured, or the session
-- predates this column) — that's the normal case today, not an error state.

alter table sessions add column if not exists sandbox_id text;
