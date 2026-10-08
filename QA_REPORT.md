# End-to-end QA report — candidate account and profile, coding assessment, terminal

Date: 2026-10-08 · Database: PostgreSQL (Supabase) · Code tested: `main` at #113, plus the fixes listed in section 6.

This is a report of what was actually run, not a test plan. Every result
below came from a real request against a running stack. There is no test
script in this document, by request.

## How it was tested

| | |
|---|---|
| Stack | Local candidate site and local candidate backend, the **real shared database**, **real Daytona** sandboxes |
| Not tested | The live site (candidate.mindfries / Railway). Chaos data doesn't belong in production, and creating accounts there isn't something to do unasked |
| Actors | Two candidates: A (the one doing the work) and B (the one trying to reach A's things) |
| API pass | 65 checks against the backend as A and B |
| Browser pass | Sign-up, sign-in, profile, linked accounts, the workspace, report pages — driven in a real browser |
| Earlier today, same code | The sandbox workspace in the browser (terminal, files both ways, Tests panel), 26 further API checks |

Three things were stand-ins, and are called out wherever they matter:
the camera (a generated picture), email (not configured locally, so no
mail was sent), and the AI evaluation (the local OpenRouter key has almost
no credit — the assistant answered, the report agents could not).

---

## 1. The happy path, from the candidate's side

Each step: what the candidate does → what is sent → what must be true in the database afterwards.

### 1.1 Account and profile

| # | The candidate… | Request | Database must show | Result |
|---|---|---|---|---|
| 1 | Fills in name, email, password, confirm; presses **Create account** | Server action `signUp` (form post) | One row in `candidate_users`: email lower-cased, `password_hash` a scrypt hash (never the password), `email_verified_at` null | ✅ |
| 2 | Lands on the dashboard, signed in | Cookie `mf_candidate` set (httpOnly, signed) | — | ✅ |
| 3 | Opens **Profile → Edit profile**, sets headline, location, availability, bio; **Save changes** | Server action `saveIdentity` | `role`, `location`, `open_to`, `notice_period`, `bio` updated; `profile_updated_at` set | ✅ |
| 4 | Uploads a PDF resume | Server action `uploadResume` (file + text read in the browser) | File in the private `resumes` bucket; `resume_path`, `resume_text`, `resume_parsed.skills` set | ✅ (run on 2026-10-07 with a real PDF) |
| 5 | Links GitHub by username | Server action `saveLink` → GitHub's public API | `links.github` set; one row in `candidate_knowledge` (`verified=false`) with projects, languages, activity | ✅ (2026-10-07, real GitHub) |
| 6 | Signs out, signs back in | `signOut`, `signIn` | `last_login_at` updated; `failed_attempts` reset to 0 | ✅ signing out and in worked; the two columns were not read back |

### 1.2 Coding assessment

| # | The candidate… | Request | Database must show | Result |
|---|---|---|---|---|
| 1 | Sees the invitation on the dashboard and in the bell | — (reads `assessments` by their email) | — | ✅ |
| 2 | Presses **Accept** | Server action `acceptInvitation` | `assessments.accepted_at` set; `status` still `invited` | ✅ |
| 3 | Presses **Start**, goes through consent and the camera check, **Enter Workspace** | `POST /api/v1/assessments/{id}/sessions` | One `sessions` row (`status=live`, `sandbox_id` set); `assessments.status=in_progress`; `candidate_applications.stage=in_progress`; a `sandbox_ready` event | ✅ about 9–12 s. Started through the API in this pass; the consent and camera wizard was not clicked through |
| 4 | Reads the task, opens files | `POST …/events` (`file_open`) | `activity_events` rows | ✅ |
| 5 | Edits a file | `PUT …/sandbox/file`, `POST …/events` (`file_edit`) | Event row; the file on the sandbox's disk has the edit | ✅ |
| 6 | Presses **Run tests** | `POST …/sandbox/run` | `terminal_command` (recorded by the server) and `test_run` events with pass/fail counts | ✅ |
| 7 | Asks the AI assistant a question | `POST …/assistant` | `ai_usage` event with the question and the answer | ✅ answered by a real model; the event row was not read back in this pass |
| 8 | Presses **Submit**, confirms, takes the interview | `POST …/interview`, then `POST …/submit` | `workspace_snapshot` event holding the sandbox's files; `sessions.status=submitted`; `sandbox_id` null; one `assessment_reports` row | ✅ submit and snapshot; ⚠️ interview not driven end to end in this pass |
| 9 | Watches the report page | `GET …/report`, event stream over WebSocket | `assessment_reports.status` moves to `ready` or `failed` | ⚠️ ended `failed` here, honestly: the local model key has no credit |

### 1.3 Terminal

| # | The candidate… | Request | Must be true afterwards | Result |
|---|---|---|---|---|
| 1 | Clicks into the terminal | `POST …/sandbox/terminal-ticket`, then a WebSocket to `/api/v1/sandbox-terminal` | A shell prompt `~/workspace %` from the real machine | ✅ |
| 2 | Types `pip install <package>` and uses it | Keystrokes over the socket | The package runs; one `terminal_command` event with exit code 0, recorded by the server | ✅ |
| 3 | Creates a file from the terminal | — | The file appears in the explorer within a moment | ✅ |
| 4 | Runs `git status` / `git diff` | — | Shows exactly what they changed since the task was handed over | ✅ |
| 5 | Resizes the panel | `{"type":"resize"}` over the socket | `stty size` in the shell reports the new size | ✅ |

---

## 2. Proxy data used

This is the data the passes above and below were run with.

```json
{
  "valid": {
    "candidate": { "name": "Asha Verma", "email": "asha.verma@example.test", "password": "correct-horse-9" },
    "profile": { "role": "Senior Backend Engineer", "location": "Pune, India", "openTo": ["Remote", "Hybrid"], "noticePeriod": "30 days", "bio": "Backend engineer, eight years on payment systems in Go and Python." },
    "links": { "github": "gaearon", "gitlab": "gitlab-bot", "portfolio": "https://example.com/work" },
    "event": { "type": "file_open", "payload": { "path": "gateway/limiter.py" } },
    "file": { "path": "/gateway/limiter.py", "content": "def apply(total, percent):\n    return total - total * percent / 100\n" },
    "command": "python3 -m unittest discover -s tests -v",
    "assistantQuestion": "What does the failing test check?"
  },
  "edgeCases": {
    "names": [
      "Zoë O'Brien-नमस्ते 🔥",
      "x × 300 characters, no spaces",
      "<img src=x onerror=\"window.__xss=1\">",
      "Robert'); DROP TABLE candidate_users;--"
    ],
    "emails": ["E2E-Profile-1007A@example.test (same address, different case)", "a.very.long.local.part+tag@sub.domain.example.test"],
    "profile": {
      "role": "🚀 <b>Staff</b> Engineer \"quoted\"",
      "location": "Zürich, 日本",
      "bio": "<script>window.__xss2=1</script> followed by 5,000 characters"
    },
    "eventPayloads": ["🔥 नमस्ते 你好 plus a right-to-left override character", "16 KB exactly", "100 events in one request"],
    "fileNames": ["/दस्तावेज़ 📁/it's \"quoted\" & $(whoami) `id`.txt", "/empty.txt (zero bytes)", "/.env"],
    "fileContents": ["ünïcödé ✅ with two lines", "512 KB exactly"],
    "commands": ["echo 'नमस्ते 🔥 ünï'", "yes | head -c 3000000 (3 MB of output)", "sleep 60 with a 5-second limit", "exit"],
    "terminal": ["five terminals opened at the same moment", "the same ticket presented twice", "resize to 132×40"]
  },
  "invalid": {
    "signUp": [
      { "case": "passwords differ", "password": "correct-horse-9", "confirm": "different-horse-9" },
      { "case": "password too short", "password": "abc" },
      { "case": "not an email", "email": "not-an-email" },
      { "case": "email with a space", "email": "has space@example.test" },
      { "case": "blank name", "name": "   " },
      { "case": "already registered", "email": "an existing account, different capitals" }
    ],
    "signIn": [
      { "case": "unknown account", "email": "nobody-here-zz@example.test" },
      { "case": "nine wrong passwords in a row" },
      { "case": "next=//evil.example.com/steal on the login link" }
    ],
    "cookies": ["none", "someone else's id with my signature", "expired", "%%%.@@@", "6,000 characters"],
    "ids": ["not-a-uuid", "00000000-0000-4000-8000-000000000000", "another candidate's real session id", "<script>alert(1)</script>"],
    "events": [
      { "type": "ai_usage", "why": "only the server may record it" },
      { "type": "sandbox_ready", "why": "only the server may record it" },
      { "type": "terminal_command", "payload": { "source": "sandbox" }, "why": "forged evidence in a sandbox session" },
      { "type": "DROP TABLE;--" },
      { "count": 101 },
      { "payloadBytes": 20000 },
      { "requestBytes": 2000000 },
      { "body": "{{{not json" },
      { "events": [] }
    ],
    "paths": ["/../../etc/passwd", "../../home/daytona/.ssh/authorized_keys", "/", "/a\\u0000b.txt", "/etc/passwd", "1,501 paths in one read"],
    "files": [{ "path": "/big.txt", "bytes": 600000 }],
    "commands": ["(only spaces)"],
    "links": ["javascript:alert(document.cookie)", "data:text/html,<script>alert(1)</script>", "ftp://files.example.com", "(only spaces)", "no-such-user-zz91827x on GitHub"],
    "assistant": ["(only spaces)", "5,000 characters"],
    "terminalHello": ["this is not json", "a ticket for the event stream", "200 KB of input in one message"]
  }
}
```

---

## 3. Chaotic behaviour — what was tried and what happened

### The impatient user

| Scenario | What happened | Verdict |
|---|---|---|
| Double-clicks **Create account** | One account. The second request is refused by the unique index on email | ✅ |
| Double-clicks **Start** on an invitation (two requests at the same instant) | One session, one sandbox. Responses were 201 and 400 "already in progress" | ✅ |
| Presses **Start** again later on the same invitation | Refused, "already in progress" | ✅ |
| Double-clicks **Save changes** on the profile | Saved once, no error | ✅ |
| Double-clicks **Submit** (two requests at the same instant) | Both answered 202, but only one wins: one report, one evaluation | ✅ |
| Submits a third time | 409 "already been submitted" | ✅ |
| Reloads the workspace mid-session | Files come back from the sandbox; nothing is kept in the browser to go stale | ✅ |
| Opens five terminals at once | Four open; the fifth says "Too many terminals are open for this session. Close one and try again." | ✅ |

### The chaos monkey

| Scenario | What happened | Verdict |
|---|---|---|
| `<img onerror>` in the name, `<script>` in the bio, `<b>` in the headline | Shown as text everywhere (dashboard, profile, menu). Nothing ran | ✅ |
| Emoji, Devanagari, CJK, accents in name, headline, location, events, file names, file contents, terminal | All stored and shown back exactly | ✅ |
| A 300-character name with no spaces | Stored cut to 200. **The page scrolled sideways** | 🔧 fixed (wraps now) |
| A 5,000-character bio, sent past the form's 500 limit | **The server stored all 5,000** — the limit was only in the browser | 🔧 fixed (server caps at 500; headline and location capped too) |
| SQL-looking text in name and email | Treated as text; the email was refused as not an email | ✅ |
| Blank name, blank password, mismatched passwords, bad email — with the browser's own validation switched off | Each refused by the server with a specific message | ✅ |
| File named with quotes, `$(whoami)`, backticks and an emoji folder | Written, listed and read back byte for byte; nothing was executed | ✅ |
| `../../etc/passwd`, a null byte, the project root, an absolute path | Refused (400), or kept inside the project | ✅ |
| A 600 KB file from the editor | 413 "request body too large" | ✅ |
| 3 MB of command output | Cut to 256 KB and marked as cut | ✅ |
| `javascript:` and `data:` as a portfolio link | Refused | ✅ |
| `ftp://files.example.com` as a portfolio link | **Saved as a broken `https://ftp//…` link** | 🔧 fixed (refused) |
| A GitHub username that doesn't exist | Refused: "No GitHub account named …" | ✅ |
| 101 events, a 20 KB payload, a 2 MB request, a malformed body, a symbol-filled event type | Each refused with the right status (400 / 413) | ✅ |
| A page posting `ai_usage` or `sandbox_ready` events itself | Refused: "recorded by the server" | ✅ |
| A page posting a fake `terminal_command` in a sandbox session | **Accepted, and looked exactly like a real one** | 🔧 fixed (refused) |
| The same terminal ticket presented twice | **Opened a second shell** | 🔧 fixed (single-use) |
| 200 KB of junk typed into the terminal in one go | That terminal closes; the backend and the session carry on | ✅ |
| `exit` in the terminal | The terminal closes with "The shell exited." | ✅ |
| Someone else's session id in the workspace address | **Opened an empty workspace blaming "a setup gap on our end"** | 🔧 fixed (404) |
| A made-up id in a report address | **Server error page** | 🔧 fixed (404) |
| `next=//evil.example.com` on the login link | Dropped; sign-in goes to the dashboard | ✅ |

### The interrupted user

| Scenario | What happened | Verdict |
|---|---|---|
| Network drops while saving the profile | **Button stuck on "Saving…" forever, no message** | 🔧 fixed: "Couldn't reach the server — check your connection and try again. Nothing you typed is lost." Retry then works. Same fix on resume, linked accounts, knowledge base and invitation buttons |
| The sandbox is stopped (as Daytona does after 30 idle minutes) and the candidate comes back | The next request restarts it in about 3 s; files intact; a terminal opens again | ✅ |
| The connection drops while a command is still running | **The command is killed with the terminal.** A long install or build is lost | ⚠️ open — see 5.1 |
| The terminal's connection drops | Says so; Enter reconnects to a **new** shell. Files are untouched; the working directory and shell variables are not kept | ⚠️ by design, worth knowing |
| The tab is closed mid-session and never reopened | The server submits the session itself once time is up, reading the work from the sandbox first | ✅ (logic covered by its own tests; not waited out in real time in this pass) |
| The page reloads between a save and the sandbox receiving it | The rule is tested in isolation (a save on its way is never overwritten by an older copy); not reproduced live | ⚠️ partly |
| The database is unreachable when the backend starts | The backend refuses to start and says why | ✅ (seen for real during this pass — see 7) |

---

## 4. Every feature, and whether it worked

✅ worked as intended · 🔧 was wrong, fixed in this pass · ⚠️ works with a caveat · ⛔ can't work until something is configured · ➖ not tested in this pass

### Account

| Feature | Result | Note |
|---|---|---|
| Sign up with email and password | ✅ | All validation holds on the server |
| Sign in / sign out | ✅ | The sign-out prompt said it "clears your resume and linked accounts" — untrue; 🔧 reworded |
| Lockout after repeated wrong passwords | ✅ | Locked on the 9th attempt for 15 minutes; the correct password is refused while locked |
| Same message for "no such account" and "wrong password" | ✅ | |
| Forgot password | ⛔ | Says plainly that the site can't send email yet. The reset flow itself was run end to end on 2026-10-07 against a stand-in mail server |
| Email confirmation | ⛔ | Same — needs the mail settings |
| Sign in with Google / GitHub / GitLab / LinkedIn | ⛔ | Buttons say "isn't connected yet"; needs provider keys |
| A signed cookie that can't be forged, altered or reused after expiry | ✅ | |

### Profile

| Feature | Result | Note |
|---|---|---|
| Edit name, headline, location, availability, bio | 🔧 | Limits now enforced by the server |
| Resume upload and reading | ✅ | PDF and DOCX; a .doc or a scan is stored but not read |
| Fill empty profile fields from the resume | ✅ | |
| Link GitHub / GitLab by username | ✅ | Refuses accounts that don't exist |
| Link LinkedIn / portfolio | 🔧 | Non-web addresses now refused |
| Knowledge base (projects, languages, activity) | ✅ | From public data |
| Sign in to GitHub / GitLab / LinkedIn to prove ownership (Composio) | ⛔ ➖ | Built; never run against real Composio — the project has no auth configs visible to the key |
| "View as others see" | ➖ | |

### Invitations and dashboard

| Feature | Result | Note |
|---|---|---|
| See invitations; accept; decline with a reason | ✅ | Verified in the browser on 2026-10-07 |
| Invitation email | ⛔ | Built; no mail settings; never sent |
| Notification bell | ✅ | |
| Environment check | ⚠️ | Works with stand-in devices; not run on a real camera or microphone |
| Practice run | ✅ | Runs in the browser, records nothing |
| Limit of three self-started sessions a day | ➖ | Not exercised in this pass |

### Assessment

| Feature | Result | Note |
|---|---|---|
| Start a session; one per invitation | ✅ | |
| A sandbox per session, task and git set up | ✅ | 9–12 s to start |
| Another candidate reading or changing the session | ✅ refused | 13 routes tried as candidate B: all refused, session untouched |
| Starting someone else's invitation | ✅ refused | |
| Activity capture (opens, edits, pastes, tab switches) | ✅ | Opens and edits seen in this pass; pastes and tab switches were verified on 2026-10-07 |
| Tests panel | ✅ | |
| AI assistant | ✅ | Answered with a real model; empty and over-long questions refused |
| Work saved by the server | ✅ | Read from the sandbox's disk, not from what the page claims |
| Interview (typed) | ➖ | Not driven end to end in this pass |
| Interview (voice) | ⛔ ➖ | Needs the Gemini key; never run on a real call |
| Submit; one report | ✅ | |
| Evidence report | ⚠️ | Failed honestly here for lack of model credit: "no agent produced usable evidence". Never yet produced by a real model in any test |
| Camera stills | ⚠️ | Stand-in camera only |
| After submit: no more events, files or terminals | ✅ | Sandbox deleted within seconds |

### Terminal

| Feature | Result | Note |
|---|---|---|
| A real shell on the sandbox | ✅ | Python 3.14, Node 25, git, gcc; internet access |
| Install and run anything | ✅ | `pip install` from the internet worked every time |
| Commands recorded by the server with exit status | ✅ | The shell's reports never appear on screen |
| Files changed in the terminal appear in the editor | ✅ | |
| Edits in the editor reach the sandbox | ✅ | |
| Resize; multiple terminals (up to four) | ✅ | |
| Refuses a bad, reused or wrong-purpose ticket | 🔧 ✅ | Reuse is now refused |
| The sandbox holds none of the backend's secrets | ✅ | Checked from inside the sandbox |

---

## 5. Gaps that still need filling

> **Update, later the same day.** Most of what this section and section 7
> list as open or "not built" has since been built on the same branch.
> [Section 9](#9-what-was-built-after-this-report) says what, how each was
> checked, and what is still open. The tables below are left as they were
> written so the findings stay on record.

### 5.1 Security and integrity

| # | Gap | Why it matters | Suggested fix |
|---|---|---|---|
| 1 | **A running command dies if the connection drops** | A candidate on poor wifi loses a long install or test run and may not know why | Keep the shell alive for a minute after a disconnect and reattach to it; or run long commands under a session manager in the sandbox |
| 2 | **The command record can be tampered with from inside the sandbox** | The shell hooks that report commands live in the candidate's own `.zshrc`. Removing them hides commands; printing the marker fakes them | Record at the process level instead (Daytona's session/exec logs, or an audit daemon outside the candidate's control), and treat the current record as indicative |
| 3 | **Test results are parsed and reported by the page** | A `test_run` event with "all passed" can be posted by a script. The server-recorded command and exit code beside it would disagree, but nothing flags that | Parse test output on the server for sandbox sessions, or have the report cross-check `test_run` against the `terminal_command` it belongs to |
| 4 | **Open internet from the sandbox** | A candidate can call any AI tool or paste service from the terminal, unseen by the built-in assistant's record | Decide the policy. Daytona supports an allow-list; a middle path is to allow package registries and git hosts only |
| 5 | **Anyone who registers an invited email gets that invitation** | Email confirmation exists but doesn't gate invitations (it can't until mail is on) | Once mail is configured, require a confirmed address before an invitation can be started |
| 6 | **Lockout can be used against someone** | Nine bad guesses lock any account for 15 minutes; there is no per-IP limit (issue #66) | Add per-IP throttling; keep the per-account lock |
| 7 | **A stolen session cookie works until it expires (14 days)**; a password reset doesn't sign out other devices (issue #63) | | A session version on the user row, bumped on password change |
| 8 | **Terminal tickets are single-use per backend instance** | With more than one instance, a ticket could be used once on each within its minute | Fine today (one instance). Move to a shared store before scaling out |
| 9 | **No cap on sandboxes per account or globally** | Each live session is a running machine. The self-start limit (3 a day) is the only brake, and invitations aren't counted | A global ceiling with a clear "try again shortly" message; alerting on the Daytona account |
| 10 | **Database scripts skip TLS verification** (issue #65); **the waitlist form has no rate limit** (issue #69) | Unchanged | As in the issues |

### 5.2 Reliability and experience

| # | Gap | Suggested fix |
|---|---|---|
| 1 | The database's direct address is IPv6-only; a network without IPv6 can't reach it (this stopped the local backend mid-pass). Railway is unaffected today | Use Supabase's pooler address in `DATABASE_URL` — it works on both |
| 2 | The 404 page is the framework's default and its tab title is "Create Next App" | A branded not-found page with a way back to the dashboard |
| 3 | Starting a session takes 9–12 s with no progress shown beyond the button | A "Preparing your workspace…" step |
| 4 | Files over 512 KB and binary files are invisible in the editor | Show them in the explorer as "too large to edit here" |
| 5 | The Run button, live preview and package helpers do nothing useful in a sandbox session | Hide them there, or wire Run to the terminal |
| 6 | A web server started in the sandbox can't be previewed | Expose Daytona's preview URL in the Ports panel |
| 7 | The report's failure text ends "see server logs for each agent's error" — shown to a candidate | Candidate-facing wording; keep the detail for the admin view |

---

## 6. What was fixed during this pass

Committed on the branch `fix/qa-findings` (not yet pushed):

1. A page can no longer post `terminal_command` events for a sandbox session.
2. A terminal ticket opens one terminal, and two issued in the same second are distinct.
3. Profile limits (name, headline, location, bio, availability choices) are enforced by the server.
4. A session that isn't the candidate's is a 404 in the workspace, not an empty workspace.
5. A malformed session id is "not found", not a server error.
6. Profile, resume, linked-account, knowledge-base and invitation buttons report a failed request instead of hanging.
7. A portfolio link must be a web address.
8. Long unbroken names wrap instead of widening the page.
9. The sign-out prompt no longer claims to clear the profile.

After the fixes the API pass reads **64 passed, 0 failed, 1 open finding** (5.1 #1).

---

## 7. What is still left to build or switch on

**Needs a key or setting, nothing to build**

- Mail (Resend) on the candidate site and the company portal → password reset, email confirmation, invitation emails.
- OpenRouter credit → evidence reports, interviewer, task generation on a real model. No report has yet been produced by a real model in any test.
- Composio auth configs → proving account ownership, knowledge base through the connection.
- Provider keys → social sign-in.
- `COMPANY_SESSION_SECRET` on the backend → companies generating their own tasks.
- Check `ALLOWED_ORIGINS` and the session secrets on Railway match the live candidate site.

**Not built**

- Screen recording (a decision, not just work).
- Company portal's report page updating live (it polls).
- Reattaching to a terminal after a disconnect (5.1 #1).
- Server-side test-result parsing (5.1 #3).
- Sandbox network policy (5.1 #4).
- Preview of a web server running in the sandbox.
- Session revocation and per-IP login throttling (issues #63, #66).
- The company backend and the admin backend are not deployed.
- The sandbox for practice runs (they use the in-browser workspace on purpose).

**Never tested for real, so unknown**

- Any AI evaluation, interview or task generation on a real model end to end.
- The voice interview on a real call.
- A real camera and microphone.
- Any real email.
- A real Composio sign-in.
- More than one candidate at a time; Daytona's concurrency limit for this account.
- The live deployment itself.

---

## 8. The platform from a user's point of view

### What a candidate can do today

- **Create an account** with email and password, sign in and out, and be locked out briefly after repeated wrong guesses.
- **Build a profile**: headline, location, availability, a short bio; upload a resume and have its skills read out; link GitHub, GitLab, LinkedIn or a portfolio; see their own projects, languages and recent activity pulled from GitHub or GitLab.
- **See what a hiring team will see** of that profile.
- **Receive invitations** on their dashboard and in a notification bell, **accept or decline** them, and see due dates coming up.
- **Check their setup** (camera, microphone, browser) and **take a practice run** that records nothing.
- **Take an assessment** in a real development environment: read the task, edit files, use a real terminal on a real Linux machine, install whatever they need, run the tests with a button, use git, and see what they've changed.
- **Ask an AI assistant** about the task — knowing that what they ask is part of the evidence.
- **Leave and come back**: the work is on the server, not in their browser tab.
- **Submit**, answer the interviewer's follow-up questions, and **read the report** on their own session.

### What a candidate cannot do yet

- Reset a forgotten password or confirm their email (mail isn't switched on).
- Sign in with Google, GitHub, GitLab or LinkedIn.
- Prove a linked account is theirs.
- Keep a long-running command alive through a dropped connection.
- Preview a web app they start inside the sandbox.
- Get a report produced by a real model — until the model account has credit, a report ends as "failed" and says so.

### What a hiring team can do today

- Sign in to the company portal (accounts are created by Mindfries, not self-serve).
- Create roles, attach or generate a task, set interview and assistant rules per role.
- Invite candidates and follow them through a pipeline, including "accepted" and "declined" with the reason.
- Open a candidate and see their profile, resume, linked code accounts (marked as confirmed or not), the session's evidence, the interview transcript, the camera timeline, and add their own notes and decision.

*(The company portal was checked earlier in the week, not re-driven in this pass.)*

### What a candidate should be told, plainly

- The camera is on for the session and stills are kept; the screen is not recorded.
- Commands, test runs, edits, pastes, time away from the tab and questions to the assistant are recorded.
- The sandbox has internet access.
- Recordings are set to be deleted after 90 days. That clean-up needs the admin portal's cron secret to be set; whether it is running on the live site was not checked.

---

## 9. What was built after this report

Everything here is on the branch `fix/qa-findings`, after the fixes in section 6. "Live" means run against the local backend, the real database and real Daytona; "browser" means driven in the candidate site.

### Built

| Gap | What exists now | How it was checked |
|---|---|---|
| 5.1 #1 — a running command dies when the connection drops | A shell belongs to the session, not the connection. If the page goes away the shell and its command carry on, output is kept (the last 512 KB) and finished commands are still recorded. The page reconnects by itself and gets the same shell back with only the output it missed; a reload gets it from the start. An unattended shell is closed after 5 minutes. Each terminal tab has its own shell; closing the tab ends it | Live, 13 checks: dropped mid-command, the command finished and was recorded with nobody attached, the same shell came back with the missed output and none repeated. Browser: reload resumed the shell; two tabs held two shells; closing one ended it |
| 5.1 #3 — test results reported by the page | In a sandbox session the server reads the result from the output it relayed (unittest, pytest, `node --test`, `go test -v`; anything else is recorded with its exit code as "not read", never as passes). A `test_run` posted by the page is refused | Unit tests on real runner output. Live: a run from the terminal and one from the Tests button were both recorded by the server; a forged one got a 400 |
| 5.1 #4 — open internet from the sandbox | `SANDBOX_NETWORK` on the backend: `open` (default), `essentials`, `none`. The workspace tells the candidate which applies | The Daytona options were tried directly: `none` reached nothing; `essentials` reached package registries and GitHub and not ordinary sites. **It also reached the large AI providers' APIs** — Daytona decides that list, and naming our own domains is refused on this account's tier. Starting a session under `essentials` or `none` through our own code was not run |
| 5.1 #5 — anyone who registers an invited email gets the invitation | Accepting an invitation needs a confirmed address wherever the site can send mail; starting one needs it when the backend has `REQUIRE_VERIFIED_EMAIL=true` | Compiles and unit tests pass. Not exercised end to end — mail is not configured here |
| 5.1 #6 — lockout, and no per-network limit (issue #66) | Failed sign-ins, sign-ups and reset requests are counted per network in the database: 20 failed sign-ins in 15 minutes, 8 sign-ups or 8 reset requests in an hour | Browser: the 21st failed sign-in was refused with a wait time. The account lock is unchanged, so nine wrong guesses still lock one account for 15 minutes |
| 5.1 #7 — a stolen cookie works for 14 days (issue #63) | A password reset, or "Sign out of all devices" in the account menu, withdraws every session the account has. Both the site and the backend check | Browser and live: after signing out everywhere, a cookie issued earlier was sent to sign-in by the site and got 401 from the backend; one issued afterwards worked. The backend remembers its answer for 20 seconds, so that is the longest a withdrawn session keeps working there |
| 5.1 #9 — no cap on sandboxes | `SANDBOX_MAX_LIVE` (default 25). One more than that starts in the browser workspace instead | Compiles; the ceiling itself was not reached in a test |
| 5.1 #10 — TLS not verified by database scripts (issue #65) | The five scripts verify the certificate when `DATABASE_CA_CERT` points at the project's CA file, and print a warning every run when it doesn't | Run three ways: with the CA (connected), with a wrong file (refused), without (warned, connected) |
| 5.1 #10 — waitlist form unlimited (issue #69) | Field caps, a hidden field that catches form-filling scripts, one sign-up per address per day, 60 sign-ups an hour overall | Type-checked only; the form was not driven |
| 5.2 #2 — default 404 page | A Mindfries not-found page with a way back; the site title is no longer "Create Next App" | Browser |
| 5.2 #3 — no progress while a session starts | The lobby says the workspace is being prepared. The session clock now starts when the workspace is ready, so the preparation is not taken out of the candidate's time | Live: a start that took 9 s left the clock at about 2 s |
| 5.2 #4 — large and binary files invisible | A status line names files the editor is leaving out and says to use the terminal | Browser, with a 945 KB text file and a binary file |
| 5.2 #5 — Run and preview do nothing in a sandbox | The notebook editor says its cells run in the browser, not the sandbox. (There is no general Run button; the Tests button already ran on the sandbox) | Type-checked only |
| 5.2 #6 — a web server in the sandbox can't be previewed | The Ports panel lists what is listening, with a link that works for an hour | Live and browser: a server started in the terminal appeared and its link served the page from outside |
| 5.2 #7 — "see server logs" shown to candidates | Reworded for a candidate; the detail stays in the server log | Unit tests pass; not seen in a browser |

### Still open

- **5.1 #2 — the command record can be tampered with from inside the sandbox.** Unchanged. It needs recording below the candidate's shell, which Daytona's API as used here doesn't offer. Server-read test results narrow what a forged record can claim, since a faked command comes with no real output.
- **5.1 #8 — terminal tickets, and now the shells themselves, live in one backend's memory.** Fine with one instance; a second instance, or a restart, ends the shells (the page says so and opens a new one).
- **A sign-out everywhere is not instant on the backend** (up to 20 seconds), and the site's edge check still only verifies the signature — the page behind it is what refuses.
- **Screen recording**, **the company report updating live** (it polls), **practice runs in a sandbox** (in the browser on purpose) and **deploying the company and admin backends** were not attempted: the first is a decision and the last is an operations job.
- Everything in section 7's "needs a key" and "never tested for real" lists is unchanged — no real model, mail, camera or Composio sign-in was used.

### For whoever deploys this

- Migration `0020_session_revocation_and_login_throttle.sql` is new. It was applied to the shared database by hand during testing, as 0018 and 0019 were, so the migration script still lists all three as pending. They are safe to run again (every statement is "if not exists").
- New backend settings, all optional: `SANDBOX_NETWORK`, `SANDBOX_MAX_LIVE`, `REQUIRE_VERIFIED_EMAIL` (turn on once mail works). New for the scripts: `DATABASE_CA_CERT`.
- The per-network limit reads the address from `x-forwarded-for`, which Vercel sets. Behind a different proxy, check that header is trustworthy.
