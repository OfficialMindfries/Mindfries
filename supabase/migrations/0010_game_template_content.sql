-- Mindfries — give an assessment a real task brief and a real starting
-- codebase, instead of every candidate seeing the same hardcoded
-- "Authentication Bug Fix" brief and the same empty IDE workspace.
--
-- task_brief: the markdown TaskDescriptionPanel renders. Nullable — a
-- template authored before this migration (or one nobody's filled in yet)
-- has none, and the IDE falls back to saying so honestly rather than
-- showing stale mock content.
--
-- starter_files: a flat {path: content} map — text only, matching the IDE's
-- own VFS shape (lib/ide/types.ts's FileContents) exactly, so what an admin
-- authors is exactly what a candidate's workspace seeds from, with no
-- format translation in between. `repo_template` (0002_product.sql) stays
-- as the free-text label it always was — a git-URL-to-clone model would
-- need real network/CORS handling this IDE deliberately doesn't have (see
-- its own CLAUDE.md); a flat text-file map fits the same "virtual,
-- local-only, text-only VFS" the rest of the IDE already commits to.

alter table game_templates add column if not exists task_brief text;
alter table game_templates add column if not exists starter_files jsonb not null default '{}'::jsonb;
