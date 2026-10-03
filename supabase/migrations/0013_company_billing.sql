-- Adds what Stripe needs to key off of for real company billing
-- (company/backend Phase 4). Nothing here changes existing CRUD — the
-- plan/seats columns companies already has (0002_product.sql) stay the
-- single source of truth for display; these two new columns are how a
-- webhook finds the right row to update.
alter table companies
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Stripe's webhooks are at-least-once delivery; this is the idempotency
-- guard so a replayed event never double-applies a plan/seat change.
create table if not exists stripe_webhook_events (
  event_id    text primary key,
  received_at timestamptz not null default now()
);
