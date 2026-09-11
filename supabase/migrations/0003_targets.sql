-- Mindfries — Targets: hand-picked companies the team is working by hand.
--
-- Distinct from `leads` (0001), which the daily crawler fills with hundreds of
-- companies for templated email. A target is a company chosen on purpose,
-- worked across several people and several channels over weeks. A target can
-- come from a lead (`lead_id`), and the app refuses to add the same company
-- twice across targets, leads and onboarded companies.
--
-- Apply after 0002_product.sql. Server-only access (service-role key), same as
-- the other admin tables — no RLS, the browser never queries Supabase.

create extension if not exists "pgcrypto";

create table if not exists target_companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  -- Normalised by the app (lower-cased, punctuation and legal suffixes like
  -- "Pvt Ltd" stripped) rather than generated here, so one rule decides what
  -- counts as "the same company" for targets, leads and onboarded rows alike.
  company_key        text not null unique,
  website            text,
  priority           text not null default 'B',          -- A|B|C
  stage              text not null default 'researching', -- researching|contacted|conversation|meeting|demo|pilot|won|lost|nurture
  why_target         text not null default '',
  notes              text not null default '',
  source             text not null default 'other',      -- warm_intro|event|linkedin|referral|tracker|other
  owner              text,                               -- which founder is running it
  next_action        text,
  next_action_due    date,                               -- for 'nurture', the date to revisit
  last_touch_at      timestamptz,                        -- latest outbound/inbound touch; notes don't count
  last_touch_summary text,
  lead_id            uuid references leads(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists target_companies_stage_idx on target_companies (stage);
create index if not exists target_companies_due_idx on target_companies (next_action_due);

-- The people at a target. A deal usually needs several: someone who signs,
-- someone who champions it, someone who'll use it day to day.
create table if not exists target_contacts (
  id             uuid primary key default gen_random_uuid(),
  target_id      uuid not null references target_companies(id) on delete cascade,
  name           text not null,
  role           text,
  email          text,
  linkedin_url   text,
  persona        text not null default 'other',          -- decision_maker|champion|influencer|recruiter|other
  warmth         text not null default 'cold',           -- cold|warm|intro
  -- Real people's personal data: an opt-out has to be honoured. The app blocks
  -- logging an outbound touch to anyone flagged here.
  do_not_contact boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists target_contacts_target_idx on target_contacts (target_id);

-- Every touch, in either direction, plus internal notes. Emails are sent from
-- the team's own inboxes and logged here; this panel never sends anything.
create table if not exists target_activities (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null references target_companies(id) on delete cascade,
  contact_id  uuid references target_contacts(id) on delete set null,
  channel     text not null,                              -- email|linkedin|call|meeting|intro|event|note
  direction   text,                                       -- outbound|inbound; null for notes
  outcome     text,                                       -- replied|meeting_booked|declined; inbound only
  summary     text not null default '',
  happened_at timestamptz not null default now(),
  by_name     text,                                       -- who made the touch
  created_at  timestamptz not null default now()
);
create index if not exists target_activities_target_idx on target_activities (target_id, happened_at desc);
