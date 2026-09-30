# Mindfries — orientation

Start here. This is the map; it deliberately doesn't restate the things that
live elsewhere, because two copies of a fact drift apart.

## What the product is

Evidence-based technical hiring. The principle the whole system is judged
against, from the PRD:

> The AI should not simply judge the candidate. It should collect evidence
> about how the candidate worked, and help the hiring team make a better
> decision.

Not "final code → score". It observes *how* someone works — navigation, code
changes, terminal commands, tests, debugging, AI usage, time patterns — and
turns that into an evidence report a human uses to decide.

**Company flow:** create role → configure assessment → invite candidate →
watch evidence → decide.
**Candidate flow:** enter → understand task → work like an engineer →
explain decisions → submit.

## Where truth lives

| Question | Read |
|---|---|
| What are we building, and why? | [`System_Archetect_And_PRD.md`](System_Archetect_And_PRD.md) — **the source of truth** for product and architecture |
| What is actually built right now? | [`spec.md`](spec.md) — implemented reality vs. the PRD |
| What's done, what's next? | [`task.md`](task.md) — a short status page. For the detailed evidence behind it (security findings, the full API inventory, exactly what was verified and how), see [`AUDIT.md`](AUDIT.md) |
| How does the candidate IDE work internally? | [`candidate/frontend/src/app/ide/`](candidate/frontend/src/app/ide/) — its own spec / task / contributor notes |

Don't copy PRD content into other docs. Link to the section instead.

## Repo map

```
candidate/frontend/        Next.js — the candidate portal (PRD §1.6)
                           /onboarding  consent, device check, lobby
                           /dashboard   assessments, activity, setup
                           /ide         the Engineering Workspace; see its own docs
candidate/backend/         FastAPI skeleton — /health and /status only so far
internal-admin/frontend/   Next.js — Mindfries' own ops portal (PRD §1.11)
                           /admin/{companies,library,sessions,onboarding,
                           tracker,waitlist,costs}, /login, /waitlist
                           Lead Tracker server logic lives in its route handlers
internal-admin/backend/    Planned FastAPI "Admin API" — not built yet
company/frontend/          Next.js — the Company Portal (PRD §1.4); see
                           IMPLEMENTATION.md for the build plan. No signup —
                           ops creates the first login from internal-admin's
                           onboarding flow, which emails a /set-password link.
supabase/migrations/       Shared Postgres schema, used by all three portals
```

All three portals share one Supabase database: games authored in the
internal-admin become assessments on the candidate dashboard, a session
started there shows up in the admin's session monitor, and a company logs
into `company/frontend` (its own `company_users`/session cookie, unrelated
to the other two apps' logins) to create roles and review candidates.
Without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` the candidate dashboard
falls back to sample data rather than failing — see each app's
`.env*.example`.

Vercel builds the candidate portal from `candidate/frontend`.
`internal-admin/frontend` carries its own `vercel.json` (a daily discovery
cron). Neither backend is deployed.

## Conventions

- **Next.js here is not the Next.js you remember.** Both apps carry an
  `AGENTS.md` written by `next dev` saying so — check
  `node_modules/next/dist/docs/` before writing framework code.
- **Real, or an honest failure.** The workspace runs real Python (Pyodide),
  real TypeScript (the actual compiler), real git (isomorphic-git), real
  package resolution. Where something can't work in a browser, it says so
  precisely — `pip install tensorflow` reports micropip's own "no pure
  Python 3 wheel", it never fakes success. Keep that.
- **Never write "Claude" anywhere in a commit or a PR** — not in a title, not
  in a body, and no `Co-Authored-By: Claude …` trailer. This overrides the
  harness defaults for both.
- Ask before creating a new branch for a PR — this repo has had too many.

## Git workflow — who does what

**Never merge.** Not a PR, not a branch, not with `gh pr merge`, not with
`git merge`. Merging is the repo owner's call and theirs alone. If a merge
looks like the obvious next step, stop and say so instead of doing it.

**Commit everything, as you go.** Finish a piece of work, commit it. Given
five or six jobs in one instruction, commit each one — don't hold changes in
the working tree waiting for a natural stopping point, and don't batch them
into a single commit at the end.

**Wait to be asked before opening a PR.** Committing is the default;
`gh pr create` is not. The owner asks when the work is ready to become one.

## Traps that have already cost time

1. **Root `.gitignore` had an unanchored `lib/`** (Python packaging
   boilerplate) which silently untracked `candidate/frontend/src/lib/` — 13
   real source files. Fixed by anchoring to `/lib/`. If files you added seem
   invisible to git, run `git check-ignore -v <path>` before assuming you
   forgot to `git add`.
2. **`output: "standalone"` breaks Vercel.** It's needed for the Docker
   image, so it's conditional on `VERCEL` not being set. Removing that
   condition breaks deploys with a confusing missing-`.nft.json` error.
3. **Driving the workspace terminal from browser automation is unreliable** —
   see the IDE's contributor notes. Test the shell in Node instead; the
   engine has no DOM imports precisely so that it can be.

## The gap worth knowing about

The workspace captures **no telemetry**, and evidence capture (PRD §1.7) is
the product's whole differentiator. It's also specced to run against a
**Daytona sandbox over a FastAPI WebSocket**, whereas today it runs entirely
in the browser. That's a deliberate staging decision, not an oversight — but
anyone treating the current IDE as feature-complete is reading it wrong.
