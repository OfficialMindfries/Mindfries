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
| 7 | Talk to an AI coding assistant | 🟡 The chat window is real; nothing answers yet |
| 8 | Do a follow-up AI interview | ❌ Needs a live voice connection that isn't built |
| 9 | Submit | ✅ Real, and can only be done successfully once per session — a candidate can't replay or reset their own submission |

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
