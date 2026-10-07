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
| 1 | AI chat assistant in the workspace | Built. Refuses to write the fix, to say where the defect is, or to confirm a guess; still answers genuine concept questions (that behaviour was run live on a real model). Replies are streamed. It is shown the whole project and the terminal's recent output, not only the open file. A company can switch it off or cap its messages per role (migration 0015, applied). Closed once the interview starts. The streaming, wider context and role settings were run end to end on 2026-10-07 against a stand-in model, not a real one, and the panel has not been opened in a browser |
| 2 | AI interviewer (follow-up questions about the candidate's work) | Built and run live through the backend. A company sets the number of questions, tone, language and time per answer on the role (migration 0014 is applied; run live on 2026-10-07 with a two-question Spanish interview). Each answer is timed by the server; at zero it is sent as it stands or recorded as unanswered. When the session clock runs out the interview opens by itself and the work is submitted after it. The dialog has not been clicked through on screen (needs a camera and microphone) |
| 3 | Voice for the interviewer | Built as a hands-free spoken conversation: the question is read aloud, the microphone opens, and a pause after speaking sends the answer. Two forms. With `GEMINI_API_KEY` set on the candidate backend it is one live voice call on Gemini's Live API, relayed through the backend so the server keeps the transcript and the time limits; run end to end on 2026-10-07 against a stand-in for Gemini, never yet against Gemini itself or in a browser. Without the key, or if the call drops, it is turn-based over the browser's speech features (Chrome and Edge) and resumes where the call stopped. Answers are recorded (voice, plus camera when on) and playable from the company's report page, and deleted after 90 days by a daily job in the admin app (needs `CRON_SECRET` set there; not yet run). Untested on a real microphone |
| 4 | Recording AI usage as evidence (prompts, what was accepted) | Built. Every assistant and interview turn is recorded and reaches the report; every model call's tokens and billed cost are stored per session. The report has an "AI assistant usage" item: how many messages were sent, how many lines of code the assistant showed, which of them appear word for word in the submitted work, and how often text was copied out of the panel. It only sees verbatim lines — an idea rewritten in the candidate's own words is not detected. Pasting into the editor is not captured (see 26) |
| 5 | Task generation per company / role | Built. From the admin library or from a company's own role page; from notes, a job description and a sample of the company's code. Every draft comes with a reference solution (never sent to a candidate) and is run before saving — tests must fail as given and pass with the solution — in a Daytona sandbox, or a local process when `TASK_VERIFY=local`; with neither it is marked "not run". A template can carry variants, dealt to candidates in turn. Company tasks are private to the company. Run end to end on 2026-10-07 against a stand-in model with the local runner (the Daytona runner has never been run). Not checked on a real model: whether generated code still labels its own bug, and the quality of what it writes from a job description |
| 6 | Evaluation report | Built. Code evaluation reads the task brief; the rubric is scored per criterion; attempts to instruct the AI are reported as an integrity finding. An agent that fails is retried once and, if it fails again, named in the report as missing. Observations cite the session moments they rest on, shown to the hiring team as times and what happened. The report says plainly when no interview took place or it was cut short, and lists large outside pastes and time away from the tab as signals. A reviewer can add notes and corrections and record their own decision beside the AI's (migration 0016). Run end to end on 2026-10-07 against a stand-in model. The default model (Claude Sonnet 4.5) has still never been run, and only Gemini has been run for real |

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
| 22 | Hosted backend so an assessment can be started at all | Deployed on Railway (`mindfries-candidate-backend.up.railway.app`), database and OpenRouter key configured. Whether the deployed candidate and admin sites point at it (`CANDIDATE_BACKEND_URL` / `ADMIN_BACKEND_URL` on Vercel) has not been checked |
| 23 | Real sandbox (Daytona) instead of in-browser execution | Not built for the workspace. A client exists and the task verifier can run a generated task in a sandbox, but no key has ever been set, so neither has run. The candidate's terminal still executes in the browser |
| 24 | Test runner and test results panel | Built. `python -m unittest` and `node --test` / `npm test` run a project's tests, and a Tests tab shows the last run as results — each test, pass or fail, and what a failure said — whether run from the panel or the terminal. Seen working in a browser on 2026-10-07 |
| 25 | Raw terminal command capture | Built. Each finished command is recorded with its exit code and duration; a test run with its counts and failing tests. Output is not sent, apart from test counts |
| 26 | Navigation, edit-by-edit, paste and tab-switch capture | Mostly built. Recorded: the file being looked at as it changes, lines added and removed on each save, pastes (size and where, never the text), and time with the tab out of view. Not keystroke-level |
| 27 | Camera recording / snapshots | Built as stills: one small image every half minute during a real session, in a private bucket, shown on the company's report page as an even sample, deleted after 90 days. Not video, and nothing analyses them. Seen storing real images on 2026-10-07 |
| 28 | Screen recording | Not built, and the dashboard no longer says the screen is recorded. Whether to build it is an open decision |
| 29 | Auto-submit when the timer reaches zero | Built. In the browser the interview opens at zero and the work is submitted after it. If the tab is closed instead, the backend submits the session itself once the time and the interview's allowance have passed, using a copy of the workspace the browser saves every two minutes. Run live on 2026-10-07: the server submitted an abandoned session and moved the invitation and pipeline with it; the evaluation that follows could not be checked because the test OpenRouter key was out of credit |
| 30 | Workspace saved to the server | Built. Saved every minute and when the tab is hidden; restored from the server when this browser has no copy or an older one. Seen restoring in a browser on 2026-10-07 |
| 31 | Separate saved workspace per assessment | Built. Each session has its own browser storage key |
| 32 | Resume an in-progress session from the dashboard | Built. An assessment under way has a Resume link; the clock keeps running on the server, and a session resumed after its interview began opens on the interview |
| 33 | Git changes view and diff viewer | Built as a Changes tab: files that differ from the task as given, with lines added and removed, each opening as a side-by-side diff. It compares with the starting files rather than git's index. Seen working in a browser on 2026-10-07 |
| 34 | `git clone` / `push` / `pull` | Refuses honestly; needs a proxy or the sandbox |
| 35 | Live status over WebSocket | Server broadcasts; the browser polls instead |

**After submitting**

| # | What | State today |
|---|---|---|
| 36 | Report page | Built; shows "failed" without an OpenRouter key |
| 37 | The company's pipeline updating when a candidate starts or submits | Built: in progress on start, completed with time taken on submit, score and per-criterion scores after evaluation; a stage set by hand is left alone. Start and submit run live on 2026-10-07; the score write-back still has not been, for lack of OpenRouter credit |
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
