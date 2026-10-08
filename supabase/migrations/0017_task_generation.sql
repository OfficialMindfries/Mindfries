-- Task generation: company-owned tasks, a reference solution, the result of
-- running a task before it was saved, and variants.
--
-- company_id: null for the Mindfries library, which every company can attach
-- to a role. Set for a task a company generated from its own portal — those
-- are saved with status 'private', which keeps them out of every query that
-- asks for 'published' templates (the candidate-facing open pool in
-- particular), and visible only to the company that owns them.
--
-- solution_files: {path: content} for the files that differ once the task is
-- done correctly. Never sent to a candidate — it exists so a task can be run
-- before it's saved, to confirm its tests fail as given and pass when solved.
--
-- verification: what that run found — see candidate/backend/internal/verify.
-- Null when the task was never run (written by hand, or no runner configured).
--
-- variants: alternative versions of the same task, each
-- {taskBrief, starterFiles, solutionFiles, verification}. A session is given
-- one of them (or the original) when it starts, so two candidates for the
-- same role needn't get the identical task.
alter table game_templates
  add column if not exists company_id     uuid references companies(id) on delete cascade,
  add column if not exists solution_files jsonb not null default '{}'::jsonb,
  add column if not exists verification   jsonb,
  add column if not exists variants       jsonb not null default '[]'::jsonb;
create index if not exists game_templates_company_idx on game_templates (company_id);
