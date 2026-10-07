package verify

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"testing"
)

// scripted answers each Run in turn and remembers what it was given.
type scripted struct {
	runs  []Run
	err   error
	calls []map[string]string
}

func (s *scripted) Name() string { return "a test runner" }

func (s *scripted) Run(_ context.Context, files map[string]string, _ []string) (Run, error) {
	s.calls = append(s.calls, files)
	if s.err != nil {
		return Run{}, s.err
	}
	run := s.runs[len(s.calls)-1]
	return run, nil
}

var pyTask = Task{
	StarterFiles:  map[string]string{"limiter.py": "buggy", "test_limiter.py": "tests"},
	SolutionFiles: map[string]string{"limiter.py": "fixed"},
}

func TestCheckVerifiesATaskThatFailsThenPasses(t *testing.T) {
	r := &scripted{runs: []Run{{ExitCode: 1, Output: "FAILED (failures=1)"}, {ExitCode: 0, Output: "OK"}}}
	got := Check(context.Background(), r, pyTask)
	if got.Status != Verified || got.Command != "python -m unittest -v" {
		t.Fatalf("got %+v", got)
	}
	if len(r.calls) != 2 || r.calls[0]["limiter.py"] != "buggy" || r.calls[1]["limiter.py"] != "fixed" || r.calls[1]["test_limiter.py"] != "tests" {
		t.Errorf("the second run should be the starter with the solution laid over it: %v", r.calls)
	}
	if !strings.Contains(got.Reason, "limiter.py changed") {
		t.Errorf("reason = %q", got.Reason)
	}
}

func TestCheckCatchesTheWaysAGeneratedTaskGoesWrong(t *testing.T) {
	cases := []struct {
		name string
		task Task
		runs []Run
		want string
	}{
		{"the planted bug isn't caught by any test", pyTask, []Run{{ExitCode: 0, Output: "OK"}}, "already pass"},
		{"the solution doesn't work", pyTask, []Run{{ExitCode: 1}, {ExitCode: 1}}, "doesn't make the tests pass"},
		{"no tests were collected", pyTask, []Run{{ExitCode: 5, Output: "Ran 0 tests in 0.000s\n\nNO TESTS RAN"}}, "found no tests"},
		{"there is no solution to try", Task{StarterFiles: pyTask.StarterFiles}, []Run{{ExitCode: 1}}, "no reference solution"},
		{"a refactoring task that starts red", Task{StarterFiles: pyTask.StarterFiles, ExpectStarterToPass: true}, []Run{{ExitCode: 1}}, "should start with them passing"},
	}
	for _, c := range cases {
		got := Check(context.Background(), &scripted{runs: c.runs}, c.task)
		if got.Status != Failed || !strings.Contains(got.Reason, c.want) {
			t.Errorf("%s: got %s — %q", c.name, got.Status, got.Reason)
		}
	}
}

func TestCheckSaysNotRunRatherThanGuessing(t *testing.T) {
	if got := Check(context.Background(), nil, pyTask); got.Status != NotRun || !strings.Contains(got.Reason, "nowhere to run") {
		t.Errorf("no runner: %+v", got)
	}
	noTests := Task{StarterFiles: map[string]string{"main.py": "print(1)"}}
	if got := Check(context.Background(), &scripted{}, noTests); got.Status != NotRun || !strings.Contains(got.Reason, "no test files") {
		t.Errorf("no tests: %+v", got)
	}
	broken := &scripted{err: errors.New("sandbox quota exceeded")}
	if got := Check(context.Background(), broken, pyTask); got.Status != NotRun || !strings.Contains(got.Reason, "sandbox quota exceeded") {
		t.Errorf("a runner that can't run is 'not run', never 'failed': %+v", got)
	}
}

func TestCommandForPicksByTestFiles(t *testing.T) {
	cases := map[string]string{
		"tests/test_api.py": "python -m unittest -v",
		"src/cart.test.js":  "node --test",
		"src/cart.test.ts":  "node --test",
	}
	for file, want := range cases {
		cmd, ok := CommandFor(map[string]string{file: "x", "README.md": "y"})
		if !ok || strings.Join(cmd, " ") != want {
			t.Errorf("%s: got %v", file, cmd)
		}
	}
	if _, ok := CommandFor(map[string]string{"main.go": "x"}); ok {
		t.Error("a project with no recognised tests has no command")
	}
}

func TestSafePathKeepsFilesInsideTheProject(t *testing.T) {
	for _, bad := range []string{"../outside.py", "a/../../b.py", "..", "C:/Windows/x", ""} {
		if _, ok := safePath(bad); ok {
			t.Errorf("%q should be refused", bad)
		}
	}
	if got, ok := safePath("/gateway/limiter.py"); !ok || got != "gateway/limiter.py" {
		t.Errorf("a leading slash is the workspace root, not the disk's: %q %v", got, ok)
	}
}

// The real thing: a small Python project, run for real.
func TestLocalRunnerActuallyRunsTheTests(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		if _, err := exec.LookPath("python"); err != nil {
			t.Skip("python is not installed here")
		}
	}
	task := Task{
		StarterFiles: map[string]string{
			"/pricing/__init__.py": "",
			"/pricing/discount.py": "def apply(total, percent):\n    return total - total * percent\n",
			"/tests/__init__.py":   "",
			"/tests/test_discount.py": "import unittest\nfrom pricing.discount import apply\n\n\nclass DiscountTest(unittest.TestCase):\n" +
				"    def test_ten_percent_off(self):\n        self.assertEqual(apply(200, 10), 180)\n",
		},
		SolutionFiles: map[string]string{
			"/pricing/discount.py": "def apply(total, percent):\n    return total - total * percent / 100\n",
		},
	}
	got := Check(context.Background(), LocalRunner{}, task)
	if got.Status != Verified {
		t.Fatalf("status %s — %s\nstarter: %+v\nsolution: %+v", got.Status, got.Reason, got.Starter, got.Solution)
	}
	if got.Starter.ExitCode == 0 || !strings.Contains(got.Starter.Output, "FAILED") || got.Solution.ExitCode != 0 {
		t.Errorf("starter should fail and the solution pass: %+v / %+v", got.Starter, got.Solution)
	}

	// The same project with a "fix" that fixes nothing.
	task.SolutionFiles = map[string]string{"/pricing/discount.py": task.StarterFiles["/pricing/discount.py"]}
	if got := Check(context.Background(), LocalRunner{}, task); got.Status != Failed {
		t.Errorf("a solution that doesn't pass should fail verification, got %s", got.Status)
	}
}
