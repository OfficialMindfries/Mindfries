// ─────────────────────────────────────────────────────────────────────────────
// BACKEND SEAM (PRD §2.3): these fixtures stand in for the FastAPI monolith +
// PostgreSQL. When apps/api lands, replace each export with a fetch to the
// Application/Admin API (e.g. GET /admin/companies) — the component code that
// consumes these shapes does not change.
// ─────────────────────────────────────────────────────────────────────────────

import type { Company, GameTemplate, RubricCriterion, Session } from "./types";

/**
 * The moment this sample snapshot represents — just after its latest event.
 * Anything that measures "today" or "this month" against the sample measures
 * from here, not from the real clock: measured from now, every trend would
 * read zero as the fixtures age, which would be a wrong answer about data
 * that was never live anyway. Real data measures from now.
 */
export const SAMPLE_AS_OF = "2026-08-29T09:30:00Z";

const standardRubric = (): RubricCriterion[] => [
  { id: "r1", label: "Technical correctness", weight: 35 },
  { id: "r2", label: "Engineering workflow", weight: 25 },
  { id: "r3", label: "Reasoning & communication", weight: 20 },
  { id: "r4", label: "AI usage", weight: 20 },
];

export const templates: GameTemplate[] = [
  {
    id: "tpl_auth_bug",
    name: "Auth Bug Hunt",
    taskVariant: "bug_fix",
    repoTemplate: "node-express-api",
    techStack: ["Node", "Express", "JWT"],
    durationMin: 60,
    interviewerPrompt:
      "Probe how the candidate located the failing auth path. Ask why they trusted the reproducing test and what alternative causes they ruled out.",
    rubric: standardRubric(),
    status: "published",
    usedByCompanies: 7,
    createdAt: "2026-06-02",
    taskBrief:
      "# Authentication Bug Fix\n\nUsers are intermittently unable to log in. `POST /login` sometimes returns `401` for correct credentials.\n\n## Your task\n\n1. Reproduce the failure using the included test suite.\n2. Find the root cause in `src/auth.js`.\n3. Fix it, and explain your reasoning in a commit message.\n\nDon't just make the test pass — make sure you understand *why* it was failing.",
    starterFiles: {
      "src/auth.js":
        "// Handles login. Somewhere in here, a valid password is sometimes rejected.\nconst users = require(\"./users\");\n\nfunction login(email, password) {\n  const user = users.find((u) => u.email === email);\n  if (!user) return { ok: false, status: 401 };\n  // TODO: candidates find the real bug here\n  if (user.password !== password) return { ok: false, status: 401 };\n  return { ok: true, status: 200, user };\n}\n\nmodule.exports = { login };\n",
      "src/users.js":
        "module.exports = [\n  { email: \"ada@example.com\", password: \"hunter2\" },\n  { email: \"grace@example.com\", password: \"correcthorse\" },\n];\n",
      "test/auth.test.js":
        "const { login } = require(\"../src/auth\");\n\n// Run this: it should always pass for a correct password.\n// Right now it doesn't, reliably.\nconst result = login(\"ada@example.com\", \"hunter2\");\nconsole.log(result.ok ? \"PASS\" : \"FAIL: \" + JSON.stringify(result));\n",
      "README.md":
        "# Auth Bug Hunt\n\nRun `node test/auth.test.js` to reproduce the failure.\n",
    },
  },
  {
    id: "tpl_rate_limiter",
    name: "Feature: Rate Limiter",
    taskVariant: "feature",
    repoTemplate: "node-express-api",
    techStack: ["Node", "Express", "Redis"],
    durationMin: 90,
    interviewerPrompt:
      "Ask the candidate to justify their limiter algorithm and how they'd handle a Redis outage. Look for trade-off reasoning, not a memorised answer.",
    rubric: standardRubric(),
    status: "published",
    usedByCompanies: 4,
    createdAt: "2026-06-18",
    taskBrief:
      "# Feature: Rate Limiter\n\nAdd a per-user rate limiter to the API — no more than 100 requests per minute, backed by Redis.\n\n## Your task\n\n1. Implement the limiter as middleware.\n2. Return `429 Too Many Requests` with a `Retry-After` header once the limit is hit.\n3. Note in a short writeup how it behaves if Redis is briefly unavailable.",
    starterFiles: {},
  },
  {
    id: "tpl_cart_refactor",
    name: "Refactor: Legacy Cart",
    taskVariant: "refactor",
    repoTemplate: "react-ts-cart",
    techStack: ["React", "TypeScript"],
    durationMin: 75,
    interviewerPrompt:
      "Explore how the candidate kept the refactor safe — which tests they leaned on and how they scoped the change to avoid regressions.",
    rubric: standardRubric(),
    status: "published",
    usedByCompanies: 3,
    createdAt: "2026-07-01",
    taskBrief:
      "# Refactor: Legacy Cart\n\n`Cart.tsx` has grown into a 400-line component mixing state, pricing logic, and rendering.\n\n## Your task\n\nExtract the pricing/discount logic into its own module with tests, without changing the cart's observable behavior. Keep every existing test passing throughout.",
    starterFiles: {},
  },
  {
    id: "tpl_webhook",
    name: "Feature: Webhook Delivery",
    taskVariant: "feature",
    repoTemplate: "python-fastapi",
    techStack: ["Python", "FastAPI"],
    durationMin: 90,
    interviewerPrompt:
      "Ask how the candidate guarantees at-least-once delivery and handles retries/idempotency. Check whether they verified it or assumed it.",
    rubric: standardRubric(),
    status: "published",
    usedByCompanies: 2,
    createdAt: "2026-07-20",
    taskBrief:
      "# Feature: Webhook Delivery\n\nBuild an outbound webhook delivery system: when an event fires, POST it to a subscriber's URL, retrying with backoff on failure.\n\n## Your task\n\n1. Guarantee at-least-once delivery.\n2. Make deliveries idempotent for the receiver (include an event id they can dedupe on).\n3. Cap retries and record final failures somewhere inspectable.",
    starterFiles: {},
  },
  {
    id: "tpl_flaky_pipeline",
    name: "Debug: Flaky Pipeline",
    taskVariant: "debug",
    repoTemplate: "python-fastapi",
    techStack: ["Python", "FastAPI", "pytest"],
    durationMin: 60,
    interviewerPrompt:
      "Understand how the candidate isolated non-determinism. Ask what signal convinced them they'd found the real cause versus a symptom.",
    rubric: standardRubric(),
    status: "draft",
    usedByCompanies: 0,
    createdAt: "2026-08-14",
    taskBrief:
      "# Debug: Flaky Pipeline\n\nA CI test suite fails intermittently — roughly 1 in 10 runs, no obvious pattern.\n\n## Your task\n\nFind the source of the non-determinism and fix it. A passing run after your fix isn't enough on its own — explain what made it flaky in the first place.",
    starterFiles: {},
  },
];

export const companies: Company[] = [
  {
    id: "co_northwind",
    name: "Northwind Labs",
    website: "northwind.dev",
    plan: "growth",
    status: "active",
    seats: 12,
    team: [
      { id: "m1", email: "priya@northwind.dev", role: "admin" },
      { id: "m2", email: "sam@northwind.dev", role: "hiring_manager" },
      { id: "m3", email: "lee@northwind.dev", role: "reviewer" },
    ],
    defaultTemplateIds: ["tpl_auth_bug", "tpl_rate_limiter"],
    createdAt: "2026-05-28",
  },
  {
    id: "co_acme",
    name: "Acme Robotics",
    website: "acmerobotics.io",
    plan: "starter",
    status: "active",
    seats: 5,
    team: [
      { id: "m4", email: "dana@acmerobotics.io", role: "admin" },
      { id: "m5", email: "kofi@acmerobotics.io", role: "reviewer" },
    ],
    defaultTemplateIds: ["tpl_rate_limiter", "tpl_cart_refactor"],
    createdAt: "2026-06-11",
  },
  {
    id: "co_vela",
    name: "Vela Systems",
    website: "vela.systems",
    plan: "enterprise",
    status: "onboarding",
    seats: 40,
    team: [
      { id: "m6", email: "admin@vela.systems", role: "admin" },
      { id: "m7", email: "hm@vela.systems", role: "hiring_manager" },
    ],
    defaultTemplateIds: ["tpl_auth_bug", "tpl_webhook"],
    createdAt: "2026-08-22",
  },
  {
    id: "co_pixelbolt",
    name: "Pixel & Bolt",
    website: "pixelbolt.co",
    plan: "trial",
    status: "active",
    seats: 3,
    team: [{ id: "m8", email: "founder@pixelbolt.co", role: "admin" }],
    defaultTemplateIds: ["tpl_webhook"],
    createdAt: "2026-08-19",
  },
  {
    id: "co_corvus",
    name: "Corvus AI",
    website: "corvus.ai",
    plan: "growth",
    status: "paused",
    seats: 10,
    team: [
      { id: "m9", email: "ops@corvus.ai", role: "admin" },
      { id: "m10", email: "review@corvus.ai", role: "reviewer" },
    ],
    defaultTemplateIds: ["tpl_rate_limiter"],
    createdAt: "2026-04-30",
  },
];

export const sessions: Session[] = [
  { id: "s1", candidateName: "Aarav Mehta", companyName: "Northwind Labs", templateName: "Auth Bug Hunt", status: "live", sandboxHealth: "healthy", progressPct: 45, durationMin: 60, elapsedMin: 27, startedAt: "2026-08-29T09:10:00Z" },
  { id: "s2", candidateName: "Bianca Rossi", companyName: "Acme Robotics", templateName: "Feature: Rate Limiter", status: "live", sandboxHealth: "degraded", progressPct: 62, durationMin: 90, elapsedMin: 55, startedAt: "2026-08-29T08:35:00Z" },
  { id: "s3", candidateName: "Chen Wei", companyName: "Northwind Labs", templateName: "Refactor: Legacy Cart", status: "evaluating", sandboxHealth: "healthy", progressPct: 100, durationMin: 75, elapsedMin: 75, startedAt: "2026-08-29T07:20:00Z" },
  { id: "s4", candidateName: "Diego Alvarez", companyName: "Vela Systems", templateName: "Auth Bug Hunt", status: "stuck", sandboxHealth: "error", progressPct: 38, durationMin: 60, elapsedMin: 41, startedAt: "2026-08-29T08:05:00Z" },
  { id: "s5", candidateName: "Emeka Obi", companyName: "Pixel & Bolt", templateName: "Feature: Webhook Delivery", status: "failed", sandboxHealth: "error", progressPct: 12, durationMin: 90, elapsedMin: 8, startedAt: "2026-08-29T09:02:00Z" },
  { id: "s6", candidateName: "Farah Nasser", companyName: "Corvus AI", templateName: "Feature: Rate Limiter", status: "completed", sandboxHealth: "healthy", progressPct: 100, durationMin: 90, elapsedMin: 88, startedAt: "2026-08-28T14:12:00Z" },
  { id: "s7", candidateName: "Gaurav Singh", companyName: "Acme Robotics", templateName: "Refactor: Legacy Cart", status: "submitted", sandboxHealth: "healthy", progressPct: 100, durationMin: 75, elapsedMin: 70, startedAt: "2026-08-29T06:40:00Z" },
  { id: "s8", candidateName: "Hana Kim", companyName: "Vela Systems", templateName: "Feature: Webhook Delivery", status: "live", sandboxHealth: "healthy", progressPct: 20, durationMin: 90, elapsedMin: 12, startedAt: "2026-08-29T09:25:00Z" },
];
