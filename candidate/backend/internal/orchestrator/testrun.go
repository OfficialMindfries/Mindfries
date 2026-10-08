package orchestrator

import (
	"context"
	"encoding/json"
	"log/slog"
	"regexp"
	"strconv"
	"strings"

	"github.com/mindfries/candidate-backend/internal/db"
)

// Test runs in a sandbox session, read here rather than by the page.
//
// In the in-browser workspace the page runs the tests and reports the
// result as a test_run event — there is nothing else that could. In a
// sandbox this backend relays the shell's output and sees each command
// finish with its exit code, so it reads the result itself: a test_run the
// candidate's browser can't have written.
//
// Like the page's reader (candidate/frontend's lib/ide/test-results.ts,
// which this follows), it only reads what a runner printed. A run it can't
// read is recorded with its exit code and `parsed: false`, never as passes.

const eventTestRun = "test_run"

// TestRun is what was read from a finished test command.
type TestRun struct {
	Command  string   `json:"command"`
	ExitCode int      `json:"exitCode"`
	Parsed   bool     `json:"parsed"`
	Passed   int      `json:"passed"`
	Failed   int      `json:"failed"`
	Skipped  int      `json:"skipped"`
	Failing  []string `json:"failing"`
	Source   string   `json:"source"`
}

var (
	commandSplit = regexp.MustCompile(`\s*(?:&&|\|\||;|\|)\s*`)
	testCommands = []*regexp.Regexp{
		regexp.MustCompile(`^(python3?|py)\s+(.*\s)?-m\s+(unittest|pytest)\b`),
		regexp.MustCompile(`^(pytest|py\.test)\b`),
		regexp.MustCompile(`^node\s+(.*\s)?--test\b`),
		regexp.MustCompile(`^(npm|pnpm|yarn|bun)\s+(test|t|run\s+test)\b`),
		regexp.MustCompile(`^(npx\s+)?(jest|vitest|mocha)\b`),
		regexp.MustCompile(`^go\s+test\b`),
		regexp.MustCompile(`^cargo\s+test\b`),
	}
	ansi = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[=>]`)
)

// IsTestCommand reports whether a command line is a test run. For a chain
// (`pip install -r requirements.txt && pytest`) it is the last command that
// decides, since that is the one whose exit code the shell reports.
func IsTestCommand(line string) bool {
	parts := commandSplit.Split(strings.TrimSpace(line), -1)
	last := parts[len(parts)-1]
	for _, re := range testCommands {
		if re.MatchString(last) {
			return true
		}
	}
	return false
}

// ParseTestRun reads a finished test command's output.
func ParseTestRun(command, output string, exitCode int) TestRun {
	run := TestRun{Command: command, ExitCode: exitCode, Failing: []string{}, Source: "sandbox"}
	if len(run.Command) > 300 {
		run.Command = run.Command[:300]
	}
	// A terminal's output: colours, and lines ending \r\n.
	text := strings.ReplaceAll(ansi.ReplaceAllString(output, ""), "\r\n", "\n")
	for _, read := range []func(string, *TestRun) bool{readUnittest, readPytest, readNodeTest, readGoTest} {
		if read(text, &run) {
			run.Parsed = true
			break
		}
	}
	if len(run.Failing) > 20 {
		run.Failing = run.Failing[:20]
	}
	return run
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// ── Python's unittest ───────────────────────────────────────────────────────

var (
	unittestRan     = regexp.MustCompile(`(?m)^Ran (\d+) tests? in `)
	unittestFailed  = regexp.MustCompile(`(?m)^FAILED \(([^)]*)\)`)
	unittestSkipped = regexp.MustCompile(`(?m)^OK \(skipped=(\d+)`)
	unittestBlock   = regexp.MustCompile(`(?m)^(?:FAIL|ERROR): (\w+) \(([\w.]+)\)\s*$`)
	labelled        = func(label string) *regexp.Regexp { return regexp.MustCompile(label + `=(\d+)`) }
	unittestLabels  = map[string]*regexp.Regexp{
		"failures": labelled("failures"), "errors": labelled("errors"),
		"skipped": labelled("skipped"), "unexpected": labelled("unexpected successes"),
	}
)

func readUnittest(text string, run *TestRun) bool {
	ran := unittestRan.FindStringSubmatch(text)
	if ran == nil {
		return false
	}
	summary := ""
	if m := unittestFailed.FindStringSubmatch(text); m != nil {
		summary = m[1]
	}
	count := func(label string) int {
		if m := unittestLabels[label].FindStringSubmatch(summary); m != nil {
			return atoi(m[1])
		}
		return 0
	}
	run.Skipped = count("skipped")
	if m := unittestSkipped.FindStringSubmatch(text); m != nil {
		run.Skipped = atoi(m[1])
	}
	run.Failed = count("failures") + count("errors") + count("unexpected")
	run.Passed = max(0, atoi(ran[1])-run.Failed-run.Skipped)
	for _, m := range unittestBlock.FindAllStringSubmatch(text, -1) {
		// "test_div (test_calc.CalcTest)", or since Python 3.11
		// "test_div (test_calc.CalcTest.test_div)": the class either way.
		where := strings.Split(strings.TrimSuffix(m[2], "."+m[1]), ".")
		run.Failing = append(run.Failing, where[len(where)-1]+"."+m[1])
	}
	return true
}

// ── pytest ──────────────────────────────────────────────────────────────────

var (
	// The closing line: "==== 2 failed, 5 passed, 1 skipped in 0.31s ====",
	// or without the rules under -q.
	pytestSummary = regexp.MustCompile(`(?m)^=*\s*((?:\d+ \w+(?:, )?)+) in [\d.]+s(?: \([^)]*\))?\s*=*$`)
	pytestCount   = regexp.MustCompile(`(\d+) (\w+)`)
	pytestFailing = regexp.MustCompile(`(?m)^(?:FAILED|ERROR) (\S+)`)
)

func readPytest(text string, run *TestRun) bool {
	all := pytestSummary.FindAllStringSubmatch(text, -1)
	if all == nil {
		return false
	}
	known := false
	for _, m := range pytestCount.FindAllStringSubmatch(all[len(all)-1][1], -1) {
		n := atoi(m[1])
		switch m[2] {
		case "passed", "xfailed":
			run.Passed += n
			known = true
		case "failed", "error", "errors", "xpassed":
			run.Failed += n
			known = true
		case "skipped", "deselected":
			run.Skipped += n
			known = true
		}
	}
	if !known {
		run.Passed, run.Failed, run.Skipped = 0, 0, 0
		return false
	}
	for _, m := range pytestFailing.FindAllStringSubmatch(text, -1) {
		run.Failing = append(run.Failing, m[1])
	}
	return true
}

// ── Node's test runner ──────────────────────────────────────────────────────

var (
	nodeCount = func(label string) *regexp.Regexp { return regexp.MustCompile(`(?m)^[ℹ#] ` + label + ` (\d+)`) }
	nodePass  = nodeCount("pass")
	nodeFail  = nodeCount("fail")
	nodeSkip  = nodeCount("skipped")
	nodeTodo  = nodeCount("todo")
	nodeX     = regexp.MustCompile(`(?m)^\s*✖ (.*?)(?: \([\d.]+ms\))?\s*$`)
)

func readNodeTest(text string, run *TestRun) bool {
	pass, fail := nodePass.FindStringSubmatch(text), nodeFail.FindStringSubmatch(text)
	if pass == nil || fail == nil {
		return false
	}
	run.Passed, run.Failed = atoi(pass[1]), atoi(fail[1])
	for _, re := range []*regexp.Regexp{nodeSkip, nodeTodo} {
		if m := re.FindStringSubmatch(text); m != nil {
			run.Skipped += atoi(m[1])
		}
	}
	// Node lists the failures once where they ran and again at the end.
	seen := map[string]bool{}
	for _, m := range nodeX.FindAllStringSubmatch(text, -1) {
		if m[1] != "failing tests:" && !seen[m[1]] {
			seen[m[1]] = true
			run.Failing = append(run.Failing, m[1])
		}
	}
	return true
}

// ── go test ─────────────────────────────────────────────────────────────────

// Only -v names each test; without it a passing package is one "ok" line
// and there is nothing to count, so that run is left unread.
var goResult = regexp.MustCompile(`(?m)^\s*--- (PASS|FAIL|SKIP): (\S+)`)

func readGoTest(text string, run *TestRun) bool {
	all := goResult.FindAllStringSubmatch(text, -1)
	if all == nil {
		return false
	}
	for _, m := range all {
		switch m[1] {
		case "PASS":
			run.Passed++
		case "SKIP":
			run.Skipped++
		default:
			run.Failed++
			run.Failing = append(run.Failing, m[2])
		}
	}
	return true
}

// RecordTestRun stores the result of a command the sandbox ran, if it was a
// test run. `output` is what the command printed, or the end of it.
func (o *Orchestrator) RecordTestRun(ctx context.Context, sessionID, command, output string, exitCode int) {
	if !IsTestCommand(command) {
		return
	}
	payload, _ := json.Marshal(ParseTestRun(command, output, exitCode))
	if err := o.RecordEvents(ctx, sessionID, []db.NewActivityEvent{{EventType: eventTestRun, Payload: payload}}); err != nil {
		slog.Error("orchestrator: recording a test run failed", "session", sessionID, "error", err)
	}
}
