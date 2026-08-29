# Mindfries — Product

AI Hiring Intelligence Platform. Monorepo for the product (separate from the
marketing landing page).

## Layout

```
apps/
  web/        Next.js + TS frontend. Shared design system across all three
              portals (Company, Candidate, Internal Admin — PRD §1.1).
              (later) apps/api — FastAPI monolith + Postgres (PRD §2.3)
```

## apps/web — Internal Admin Portal (first slice)

The Mindfries-team operations panel (PRD §1.11). MVP scope (PRD §2.1):

- **Company Onboarding** — create a company, set plan/tier, assign its team,
  provision its default assessment templates. `/admin/companies`
- **Assessment / Game Library** — author base repo templates, task variants
  (Bug Fix / Feature / Refactor / Debug), interviewer prompts, and rubrics,
  then publish to the company-selectable library. `/admin/library`
- **Global Session Monitor** — every candidate session across all companies;
  reset a stuck sandbox or re-trigger evaluation. `/admin/sessions`

Backend, sandbox, and auth are out of scope for this slice — the UI runs on
typed fixtures in `apps/web/lib/mock-data.ts`, which is the seam where the
FastAPI API plugs in (see the header comment there). Auth is a stubbed login
wired to Clerk later.

### Run

```bash
cd apps/web
npm install
npm run dev     # http://localhost:3000  → /login → /admin
```

Stack: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · Geist.
Design system ported from the landing page (light-gray canvas, white rounded
panels, violet primary + coral secondary).
