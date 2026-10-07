-- A human reviewer's hand on an AI-written report: notes and corrections
-- against what the agents wrote, and the reviewer's own decision alongside
-- the AI's recommendation. Written and read by the Company Portal only —
-- none of this is shown to the candidate.
--
-- A note is attached to an evidence *category* ("reasoning", "interview",
-- …), not to an evidence_items row: re-running the evaluation replaces those
-- rows, and what a reviewer wrote about the reasoning section should still
-- be there afterwards. A null category is a note on the report as a whole.
create table if not exists report_annotations (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references assessment_reports(id) on delete cascade,
  category     text,
  kind         text not null default 'note',     -- note|correction
  body         text not null,
  author_name  text not null,
  author_email text not null,
  created_at   timestamptz not null default now()
);
create index if not exists report_annotations_report_idx on report_annotations (report_id);

-- The reviewer's decision sits beside the AI's recommendation; it never
-- replaces it. Both stay visible, so it is always clear which one a person
-- made.
alter table assessment_reports
  add column if not exists reviewer_recommendation text,   -- strong_hire|hire|lean_no|no_hire
  add column if not exists reviewer_note           text,
  add column if not exists reviewed_by             text,
  add column if not exists reviewed_at             timestamptz;
