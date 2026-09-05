-- Mindfries — Lead Tracker schema (PRD: outbound growth pipeline).
-- Apply once in the Supabase SQL editor (officemindfries project) or via
-- `supabase db push`. Everything the Tracker/Waitlist/Onboarding/Costs pages
-- read and write lives here. No RLS: only the server (service-role key) touches
-- these tables — the browser never queries Supabase directly.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Companies discovered by the daily crawler, ranked by ICP fit.
create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  company       text not null,
  domain        text,
  contact_email text,                       -- best-guess or manually filled
  source        text not null,              -- 'remoteok' | 'arbeitnow' | ...
  source_url    text,
  role_title    text,                       -- the job posting that surfaced them
  location      text,
  tags          text[] default '{}',
  score         int  not null default 0,    -- 0..100 ICP rank
  stage         text not null default 'new',-- new|emailed|replied|demo|poc|onboarded|rejected
  last_emailed_at timestamptz,
  created_at    timestamptz not null default now(),
  -- Normalized name so the daily crawl can upsert (one company shows up once
  -- even if it posts many jobs). Generated → the app never sets it.
  company_key   text generated always as (lower(company)) stored unique
);

create index if not exists leads_stage_idx on leads (stage);
create index if not exists leads_score_idx on leads (score desc);

-- Email lifecycle: our sends + Resend engagement webhooks + manual reply marks.
create table if not exists email_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references leads(id) on delete cascade,
  type       text not null,                 -- sent|delivered|opened|clicked|replied|bounced
  template   text,                          -- demo|poc
  resend_id  text,
  created_at timestamptz not null default now()
);
create index if not exists email_events_lead_idx on email_events (lead_id);

-- Public "join the waitlist / email us" submissions from the landing page.
create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text not null,
  company    text,
  message    text,
  created_at timestamptz not null default now()
);

-- Companies we've onboarded as paying users, with issued login + our cost.
-- Note: we do NOT store the temp password — it's emailed once and discarded.
create table if not exists onboarded_companies (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references leads(id) on delete set null,
  company      text not null,
  admin_email  text not null,
  plan         text not null default 'starter',   -- trial|starter|growth|enterprise
  monthly_cost numeric not null default 0,         -- what this company costs US / month
  status       text not null default 'active',     -- active|paused
  credentials_sent_at timestamptz,
  created_at   timestamptz not null default now()
);
