package orchestrator

import (
	"reflect"
	"testing"
)

func TestIsTestCommand(t *testing.T) {
	yes := []string{
		"python -m unittest -v", "python3 -W ignore -m pytest tests/", "pytest -q", "node --test",
		"npm test", "npm run test", "pnpm test", "npx vitest run", "go test ./...", "cargo test",
		"pip install -r requirements.txt && pytest",
	}
	no := []string{"ls", "echo pytest", "python app.py", "cat test_results.txt", "pytest && echo done", "git commit -m 'go test'"}
	for _, c := range yes {
		if !IsTestCommand(c) {
			t.Errorf("%q should be a test command", c)
		}
	}
	for _, c := range no {
		if IsTestCommand(c) {
			t.Errorf("%q should not be a test command", c)
		}
	}
}

func TestParseTestRun(t *testing.T) {
	cases := []struct {
		name, command, output string
		exit                  int
		parsed                bool
		passed, failed, skip  int
		failing               []string
	}{
		{
			name: "unittest, a failure and a skip, as a terminal prints it", command: "python -m unittest -v", exit: 1,
			output: "test_add (test_calc.CalcTest) ... ok\r\ntest_div (test_calc.CalcTest) ... FAIL\r\ntest_x (test_calc.CalcTest) ... skipped 'later'\r\n\r\n" +
				"======================================================================\r\nFAIL: test_div (test_calc.CalcTest)\r\n" +
				"----------------------------------------------------------------------\r\nAssertionError: 1 != 2\r\n\r\n" +
				"----------------------------------------------------------------------\r\nRan 3 tests in 0.002s\r\n\r\nFAILED (failures=1, skipped=1)\r\n",
			parsed: true, passed: 1, failed: 1, skip: 1, failing: []string{"CalcTest.test_div"},
		},
		{
			name: "unittest, all passing", command: "python -m unittest", exit: 0,
			output: "....\n----------------------------------------------------------------------\nRan 4 tests in 0.001s\n\nOK\n",
			parsed: true, passed: 4, failing: []string{},
		},
		{
			name: "pytest in colour", command: "pytest", exit: 1,
			output: "tests/test_a.py .F.s\n\n=========== short test summary info ===========\nFAILED tests/test_a.py::test_two - assert 1 == 2\n" +
				"\x1b[31m=========== \x1b[31m\x1b[1m1 failed\x1b[0m, \x1b[32m2 passed\x1b[0m, \x1b[33m1 skipped\x1b[0m\x1b[31m in 0.12s\x1b[0m\x1b[31m ===========\x1b[0m\n",
			parsed: true, passed: 2, failed: 1, skip: 1, failing: []string{"tests/test_a.py::test_two"},
		},
		{
			name: "pytest -q", command: "pytest -q", exit: 0,
			output: "...                                                    [100%]\n3 passed in 0.01s\n",
			parsed: true, passed: 3, failing: []string{},
		},
		{
			name: "node --test", command: "node --test", exit: 1,
			output: "✔ adds (0.5ms)\n✖ divides (1.2ms)\n  AssertionError: nope\nℹ tests 2\nℹ pass 1\nℹ fail 1\nℹ skipped 0\nℹ todo 0\n\n✖ failing tests:\n\n✖ divides (1.2ms)\n",
			parsed: true, passed: 1, failed: 1, failing: []string{"divides"},
		},
		{
			name: "go test -v", command: "go test -v ./...", exit: 1,
			output: "=== RUN   TestA\n--- PASS: TestA (0.00s)\n=== RUN   TestB\n--- FAIL: TestB (0.00s)\nFAIL\n",
			parsed: true, passed: 1, failed: 1, failing: []string{"TestB"},
		},
		{
			// The exit code is all that is known; it is not turned into passes.
			name: "output that isn't a runner's", command: "npm test", exit: 0,
			output: "> echo all 12 tests passed\nall 12 tests passed\n", failing: []string{},
		},
		{
			name: "a runner that never started", command: "pytest", exit: 127,
			output: "zsh: command not found: pytest\n", failing: []string{},
		},
	}
	for _, c := range cases {
		got := ParseTestRun(c.command, c.output, c.exit)
		if got.Parsed != c.parsed || got.Passed != c.passed || got.Failed != c.failed || got.Skipped != c.skip || got.ExitCode != c.exit || !reflect.DeepEqual(got.Failing, c.failing) {
			t.Errorf("%s: got %+v", c.name, got)
		}
		if got.Source != "sandbox" {
			t.Errorf("%s: source %q", c.name, got.Source)
		}
	}
}
