-- Mindfries — real social sign-in for candidates.
--
-- The four social buttons on the login page (Google/GitHub/GitLab/LinkedIn)
-- previously did nothing but say so honestly — see LoginForm.tsx's doc
-- comment. This is the data-model half of making them real: an OAuth
-- identity can be linked to a candidate account, and an account created
-- purely through OAuth has no password at all.
--
-- Apply after 0005_candidate_users.sql.

-- A candidate who signs up via Google/GitHub/GitLab/LinkedIn never sets a
-- password — there's nothing to hash. NULL means "no password auth for this
-- account", not "forgot to set one"; checkCredentials in lib/auth/users.ts
-- already refuses (via verifyPassword's dummy-hash path) rather than crash
-- on a null hash, so this is safe to loosen without touching app code.
alter table candidate_users alter column password_hash drop not null;

-- One candidate can arrive via more than one provider (GitHub for the code
-- evidence, LinkedIn for background) without that meaning two accounts —
-- each row here is one provider identity, pointing at the one candidate_users
-- row it's linked to. provider_user_id is the platform's own opaque id
-- (GitHub's numeric id, Google's "sub", etc.), never the email — emails
-- change providers and get reused; the platform's own id is what's stable.
create table if not exists candidate_oauth_identities (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references candidate_users(id) on delete cascade,
  provider          text not null,  -- google|github|gitlab|linkedin
  provider_user_id  text not null,
  email_at_link     text,           -- whatever the provider reported at link time, for support debugging only
  created_at        timestamptz not null default now()
);

-- The pair that must be unique: the same GitHub account can't end up linked
-- to two different candidate rows.
create unique index if not exists candidate_oauth_identities_provider_key
  on candidate_oauth_identities (provider, provider_user_id);
create index if not exists candidate_oauth_identities_candidate_idx
  on candidate_oauth_identities (candidate_id);
