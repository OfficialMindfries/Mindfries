-- Mindfries — link the sales/billing record to the real product account.
--
-- ADMIN_BACKEND_PLAN.md §3, §5.3: `onboarded_companies` (sales pipeline —
-- created by Tracker's OnboardForm, real and working) and `companies` (the
-- real product account a future Company Portal login needs — real since
-- 0002_product.sql, but never written by any code until this migration's
-- companion app change) answer different questions and both belong in the
-- data model. This is the "or link to" half of that fix: winning a deal
-- now creates both rows, in one function, and this column is what keeps
-- them findable from each other instead of just coexisting unlinked.
--
-- Nullable: every onboarded_companies row that predates this stays valid,
-- just unlinked — there is nothing to backfill it from.

alter table onboarded_companies add column if not exists company_id uuid references companies(id) on delete set null;
create index if not exists onboarded_companies_company_idx on onboarded_companies (company_id);
