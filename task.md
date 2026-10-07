# Build status

A quick, plain-language look at what's actually built, checked against the
product plan ([`System_Archetect_And_PRD.md`](System_Archetect_And_PRD.md)
§2.1). For the full technical detail behind any line here — exact files,
what was tested and how, the full security review — see
[`AUDIT.md`](AUDIT.md). Detail on the in-browser code editor itself lives in
its own [task.md](candidate/frontend/src/app/ide/task.md).

**Last updated: 2026-09-15.**

**Legend:** ✅ Done and real · 🟡 Partly done · ❌ Not built yet

---

## Company side

A company can't do any of this for itself yet — there's no Company Portal
at all. This is the single biggest thing missing from the product.

| # | What a company should be able to do | Status |
|---|---|---|
| 1 | Sign up | ❌ No sign-up page or account system exists for companies |
| 2 | Create a role | ❌ |
| 3 | Pick or configure an assessment | ❌ |
| 4 | Invite a candidate | 🟡 Our own team can send a real invitation on a company's behalf. A company still can't do it themselves |
| 5 | See how an assessment is going | ❌ |
| 6 | Review a candidate's report | ❌ |

## Candidate side

Mostly real and working.

| # | What a candidate should be able to do | Status |
|---|---|---|
| 1 | Accept an invitation | 🟡 Works once an invitation exists — but only our team can create one today. Candidates can also just sign up themselves, with email/password or with Google, GitHub, GitLab, or LinkedIn |
| 2 | Complete basic setup (consent, camera check, instructions) | ✅ |
| 3 | Enter the coding workspace | 🟡 Works, but the workspace page itself has no login check — reachable by anyone with the link |
| 4 | Read the task | ✅ Real, as long as someone has written a real task description for that assessment. If not, it says so honestly instead of showing a fake one |
| 5 | Work in a real codebase | ✅ Real, same condition as above — starts empty if nobody's added starter files yet |
| 6 | Use a terminal, run tests | 🟡 The terminal is fully real. There's no automatic test runner yet |
| 7 | Talk to an AI coding assistant | 🟡 Built and answering — it sees the task and the open file, and won't write the solution. Needs the hosted backend and OpenRouter credit to run for real candidates |
| 8 | Do a follow-up AI interview | 🟡 Built — four questions about the candidate's own changes before submit, typed or by turn-based voice. Not a live call. Same hosting and credit condition |
| 9 | Submit | ✅ Real, and can only be done successfully once per session — a candidate can't replay or reset their own submission |

### Candidate side — everything still to build

Checked against the code on 2026-10-07. Two decisions are already made:
the AI interviewer and assistant use a **Gemini model through OpenRouter**,
and social accounts are connected through **Composio**.

**AI**

| # | What | State today |
|---|---|---|
| 1 | AI chat assistant in the workspace | Built and run live. Refuses to write the fix, to say where the defect is, or to confirm a guess; still answers genuine concept questions. Closed once the interview starts |
| 2 | AI interviewer (follow-up questions about the candidate's work) | Built and run live through the backend. A company sets the number of questions, tone, language and time per answer on the role (needs migration 0014 applied). Each answer is timed by the server; at zero it is sent as it stands or recorded as unanswered. When the session clock runs out the interview opens by itself and the work is submitted after it. The dialog has not been clicked through on screen (needs a camera and microphone) |
| 3 | Voice for the interviewer | Built as a hands-free spoken conversation: the question is read aloud, the microphone opens, and a pause after speaking sends the answer. Turn-based over the browser's speech features (Chrome and Edge), not one open audio line — that would need Gemini's Live API directly. Answers are recorded (voice, plus camera when on) and playable from the company's report page. Untested on a real microphone |
| 4 | Recording AI usage as evidence (prompts, what was accepted) | Partly. Every assistant and interview turn is recorded and reaches the report, and every model call's tokens and billed cost are stored per session (shown on the admin Costs page). Whether a suggestion was then used in the code is not tracked. Cost recording is unit-tested but not yet run against the live database |
| 5 | Task generation per company / role | Built and run live from the backend: produced a 7-file Python project whose tests fail on the planted bug and pass once fixed. Admin button not yet clicked; a company can't trigger it from its own portal; only Python tasks have runnable tests in the workspace |
| 6 | Evaluation report | Built and run live at the model level. Code evaluation now reads the task brief; the template's rubric is scored per criterion with reasons and a weighted overall; attempts to instruct the AI are reported as an integrity finding and did not change the outcome in testing; the activity log sent to models is bounded. Only tested on Gemini models — the default (Claude Sonnet 4.5) has never been run |

**Profile and accounts**

| # | What | State today |
|---|---|---|
| 7 | Connect GitHub / GitLab / LinkedIn through Composio | Not built — "Connect" stores a typed username only |
| 8 | Candidate knowledge base (projects, languages, activity pulled from connected accounts) | Not built — no table, nothing pulled |
| 9 | Resume parsing into the profile / knowledge base | A parser file exists but nothing calls it; the resume is only stored |
| 10 | The profile a hiring team actually sees | Preview toggle exists on the candidate's side; the company portal doesn't show any of it |
| 11 | Forgot / reset password | Not built |
| 12 | Email verification on sign-up | Not built |
| 13 | Sign-in with Google / GitHub / GitLab / LinkedIn | Built; each provider is off until its keys are added |

**Invitations and dashboard**

| # | What | State today |
|---|---|---|
| 14 | Invitation email with a link | Not sent — a candidate only sees an invite if they sign up with the same email |
| 15 | Accept / decline an invitation | Not built |
| 16 | Notifications (invite, deadline, report ready) | Bell and panel built; nothing feeds them |
| 17 | Activity feed "See all" | Button does nothing |
| 18 | Environment check (camera, mic, browser) | Placeholder page; never marked done on the dashboard |
| 19 | Practice run | Placeholder page; not tracked |
| 20 | Login check on `/practice` and `/environment-check` | Missing — both open without signing in |
| 21 | Per-candidate limit on self-started sessions | Missing |

**Workspace**

| # | What | State today |
|---|---|---|
| 22 | Hosted backend so an assessment can be started at all | Not deployed — the live site can list assessments but not start one |
| 23 | Real sandbox (Daytona) instead of in-browser execution | Client built, switched off, and never asked to run a command |
| 24 | Test runner and test results panel | Partly. `python -m unittest` now runs a multi-file Python project's tests in the terminal. No results panel, and JavaScript projects still can't run tests (`npm test`, multi-file `node`) |
| 25 | Raw terminal command capture | Not built — only file saves and git / npm / pip output are recorded |
| 26 | Navigation, edit-by-edit, paste and tab-switch capture | Not built |
| 27 | Camera recording / snapshots | Camera is required and shown, nothing is stored |
| 28 | Screen recording | Not built, though the dashboard says the screen is recorded |
| 29 | Auto-submit when the timer reaches zero | Missing — the clock stops and nothing happens; the server doesn't enforce the limit either |
| 30 | Workspace saved to the server | Browser only; lost on another device |
| 31 | Separate saved workspace per assessment | Missing — one browser storage key is shared by every session |
| 32 | Resume an in-progress session from the dashboard | Not built |
| 33 | Git changes view and diff viewer | Not built |
| 34 | `git clone` / `push` / `pull` | Refuses honestly; needs a proxy or the sandbox |
| 35 | Live status over WebSocket | Server broadcasts; the browser polls instead |

**After submitting**

| # | What | State today |
|---|---|---|
| 36 | Report page | Built; shows "failed" without an OpenRouter key |
| 37 | The company's pipeline updating when a candidate starts or submits | Built: in progress on start, completed with time taken on submit, score and per-criterion scores after evaluation; a stage set by hand is left alone. Not yet run against the live database |
| 38 | Candidate-facing outcome (shortlisted, rejected) | Not built |

## What the platform should do behind the scenes

| # | What | Status |
|---|---|---|
| 1 | Give each candidate an isolated sandbox | 🟡 Built, but switched off — no API key configured yet |
| 2 | Track what a candidate actually does | 🟡 Real, but partial — captures file saves and terminal *commands run through the system* (git, package installs, etc.), not every raw keystroke typed into the terminal |
| 3 | Run tests automatically | ❌ |
| 4 | Store code changes safely | 🟡 Saved in the candidate's own browser only — not backed up anywhere else yet |
| 5 | Generate evaluation evidence | 🟡 Built, but switched off — no AI API key configured yet |
| 6 | Generate a final report | ✅ |

## Our own internal admin tools

All four working.

| # | What | Status |
|---|---|---|
| 1 | Onboard a new company | ✅ |
| 2 | Write and publish assessment templates | ✅ |
| 3 | See every company's sessions in one place | ✅ |
| 4 | Reset a stuck session | ✅ |

## Built, but not part of the original checklist above

- **Real sign-in with Google, GitHub, GitLab, or LinkedIn** — works, but
  each one only turns on once someone registers a real app with that
  provider and adds the keys.
- **A small sales CRM** for our own outreach team (`/admin/targets`) —
  fully real, just never mentioned here before.
- **Real email sending** (waitlist replies, lead outreach) — built, but
  switched off until someone adds a real email-sending key.

---

## Known gaps, in plain terms

- **No Company Portal.** Still the single biggest hole — see above.
- **A candidate can start as many separate practice sessions as they want**
  from the open, non-invited pool of assessments — there's no per-candidate
  limit yet. (A candidate *can't* replay or resubmit the same session
  anymore — that's fixed.)
- **Terminal keystrokes aren't tracked** as evidence yet — everything else
  a candidate does is.
- **Most of the database is still empty.** Every feature listed as ✅ has
  been tested against the real database, but nothing has real customers or
  candidates in it yet.
- **Every candidate gets the same fixed task and codebase** unless someone
  writes a custom one by hand. A real system to generate a codebase
  specific to each company was discussed and written up in the product
  plan ([PRD §1.4](System_Archetect_And_PRD.md)) — decided, not built.

## Security, in plain terms

The core login system (passwords, sessions, admin access) is solid — we
checked it carefully. We also found and fixed several real problems: a
session could be resubmitted endlessly, a lower-permission admin account
could do anything a full admin could, two settings pages would let anyone
in if a security key was left blank, and there was no limit on how much
data a candidate's browser could send us. All of those are fixed now. A
short list of smaller things is still open — see `AUDIT.md` for the full
write-up with exact detail.

## Waiting on a decision (not something we can just build)

- **Where does a candidate's code actually run** — in the browser, like
  today, or in a real isolated sandbox on our own servers?
- **Where does our own backend server run?** Right now it only runs on a
  developer's laptop — it needs a real home online.
- **Which AI model should each evaluation step use?**
- **Should candidates keep being able to sign themselves up**, or should
  that eventually require a real invitation only?
- **Should we capture raw terminal keystrokes**, given the extra work
  needed to do it safely?
- **How should a company-specific codebase actually get generated?**
  Decided in principle (see "Built, but not part of the original checklist"
  and [PRD §1.4](System_Archetect_And_PRD.md)) — waiting on the Company
  Portal to exist before it's built.

## What's next, in order

1. **Build the Company Portal.** The biggest thing left, by far.
2. **Get real API keys** for the AI evaluation service and the sandbox
   service — everything downstream is already built and just waiting.
3. **Decide the AI interview's timeline** — build it for real, or say
   clearly it's not happening soon.
4. **Connect the live status/terminal streaming** that's already built but
   nothing uses yet.
5. **Merge the two "reset a session" tools into one** — one is the real
   one, the other is a temporary backup.
