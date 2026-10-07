// Package verify runs a generated task before anyone saves it, to find out
// whether it is what it claims to be: tests that fail on the code as given,
// and pass once the reference solution is applied.
//
// A model writes the task, the bug and the tests in one go, and nothing
// stops it producing a "failing" test that passes, or a fix that doesn't
// fix. Reading the code doesn't settle that; running it does.
//
// Running model-written code needs somewhere to run it. There are two
// runners: a Daytona sandbox, and — for development, on a machine you are
// happy to run that code on — a local process. With neither configured the
// answer is "not run", stated as such. A task is never reported as verified
// without having been executed.
package verify

import (
	"context"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"
)

// Statuses of a Report.
const (
	Verified = "verified" // ran, and behaved as a task should
	Failed   = "failed"   // ran, and didn't
	NotRun   = "not_run"  // could not be run; Reason says why
)

// Report is what running a task found.
type Report struct {
	Status string `json:"status"`
	// Reason is one sentence a task author can act on.
	Reason string `json:"reason"`
	// Command is what was run, e.g. "python -m unittest".
	Command string `json:"command,omitempty"`
	// The two runs: the code as given, and with the solution applied.
	Starter  *Run `json:"starter,omitempty"`
	Solution *Run `json:"solution,omitempty"`
	// CheckedAt is when this was run, RFC 3339.
	CheckedAt string `json:"checkedAt,omitempty"`
}

// Run is one execution of the task's tests.
type Run struct {
	ExitCode int `json:"exitCode"`
	// Output is the end of what the tests printed.
	Output string `json:"output"`
}

// Runner executes a command in a fresh copy of a set of files.
type Runner interface {
	// Name says where the code runs, for the report.
	Name() string
	Run(ctx context.Context, files map[string]string, command []string) (Run, error)
}

// Task is the part of a generated task that verification needs.
type Task struct {
	StarterFiles  map[string]string
	SolutionFiles map[string]string
	// ExpectStarterToPass is true for a task whose tests should already be
	// green before the candidate starts — a refactoring task. Everything
	// else (a bug to fix, a feature to add) should start with a failure.
	ExpectStarterToPass bool
}

const runTimeout = 90 * time.Second

// CommandFor picks the test command from what the project contains.
func CommandFor(files map[string]string) ([]string, bool) {
	var py, js bool
	for p := range files {
		base := path.Base(p)
		switch {
		case strings.HasSuffix(p, ".py") && (strings.HasPrefix(base, "test_") || strings.HasSuffix(base, "_test.py")):
			py = true
		case isJSTest(p):
			js = true
		}
	}
	switch {
	case py:
		return []string{"python", "-m", "unittest", "-v"}, true
	case js:
		return []string{"node", "--test"}, true
	}
	return nil, false
}

func isJSTest(p string) bool {
	for _, suffix := range []string{".test.js", ".test.mjs", ".test.cjs", ".spec.js", ".test.ts", ".spec.ts"} {
		if strings.HasSuffix(p, suffix) {
			return true
		}
	}
	return false
}

// Check runs the task and reports what it found. runner may be nil.
func Check(ctx context.Context, runner Runner, task Task) Report {
	report := Report{Status: NotRun, CheckedAt: time.Now().UTC().Format(time.RFC3339)}
	if runner == nil {
		report.Reason = "Not run: this server has nowhere to run a generated task (no sandbox is configured)."
		return report
	}
	command, ok := CommandFor(task.StarterFiles)
	if !ok {
		report.Reason = "Not run: the project has no test files this can run (Python test_*.py, or JavaScript/TypeScript *.test.js / *.test.ts)."
		return report
	}
	report.Command = strings.Join(command, " ")
	if strings.HasSuffix(report.Command, ".ts") || hasTS(task.StarterFiles) {
		report.Reason = "Not run: TypeScript tests need a compile step this runner doesn't have. They do run in the candidate's workspace."
		return report
	}

	ctx, cancel := context.WithTimeout(ctx, 2*runTimeout)
	defer cancel()

	starter, err := runner.Run(ctx, task.StarterFiles, command)
	if err != nil {
		report.Reason = "Not run: " + runner.Name() + " could not run the tests (" + err.Error() + ")."
		return report
	}
	report.Starter = &starter
	if ranNothing(starter.Output) {
		return fail(report, "The test command found no tests to run, so nothing was checked. Test files may be somewhere the runner doesn't look.")
	}

	if task.ExpectStarterToPass {
		if starter.ExitCode != 0 {
			return fail(report, "The tests fail on the code as given, but this kind of task should start with them passing.")
		}
	} else if starter.ExitCode == 0 {
		return fail(report, "The tests already pass on the code as given, so nothing shows the candidate what is wrong — the problem isn't caught by any test.")
	}

	if len(task.SolutionFiles) == 0 {
		if task.ExpectStarterToPass {
			report.Status, report.Reason = Verified, "The tests pass on the code as given. There is no reference solution to check a refactoring against."
			return report
		}
		return fail(report, "The tests fail on the code as given, as they should, but no reference solution was provided, so it isn't known that the task can be solved.")
	}

	solved := map[string]string{}
	for p, c := range task.StarterFiles {
		solved[p] = c
	}
	for p, c := range task.SolutionFiles {
		solved[p] = c
	}
	solution, err := runner.Run(ctx, solved, command)
	if err != nil {
		report.Reason = "Not run: " + runner.Name() + " could not run the tests against the solution (" + err.Error() + ")."
		return report
	}
	report.Solution = &solution
	if solution.ExitCode != 0 {
		return fail(report, "The reference solution doesn't make the tests pass, so the task as written may not be solvable.")
	}

	report.Status = Verified
	report.Reason = fmt.Sprintf("Ran in %s: the tests fail on the code as given and pass with the reference solution (%s changed).", runner.Name(), changed(task.SolutionFiles))
	if task.ExpectStarterToPass {
		report.Reason = fmt.Sprintf("Ran in %s: the tests pass on the code as given and still pass with the reference solution.", runner.Name())
	}
	return report
}

func fail(report Report, reason string) Report {
	report.Status, report.Reason = Failed, reason
	return report
}

func hasTS(files map[string]string) bool {
	for p := range files {
		if strings.HasSuffix(p, ".ts") || strings.HasSuffix(p, ".tsx") {
			return true
		}
	}
	return false
}

func changed(files map[string]string) string {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	if len(paths) == 1 {
		return paths[0]
	}
	return fmt.Sprintf("%d files", len(paths))
}

// tail keeps the end of a run's output, which is where a test runner puts
// its verdict.
func tail(output string, max int) string {
	output = strings.TrimSpace(strings.ToValidUTF8(output, ""))
	if len(output) <= max {
		return output
	}
	return "…" + output[len(output)-max:]
}

// ranNothing spots a test run that executed no tests. Depending on the
// runner's version that exits zero or non-zero, so the exit code alone
// would read it as "passes" or as "fails as it should" — both wrong.
func ranNothing(output string) bool {
	return strings.Contains(output, "Ran 0 tests") || strings.Contains(output, "NO TESTS RAN") ||
		(strings.Contains(output, "# tests 0") && strings.Contains(output, "# pass 0"))
}
