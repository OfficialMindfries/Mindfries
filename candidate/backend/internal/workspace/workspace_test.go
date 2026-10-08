package workspace

import (
	"bytes"
	"context"
	"encoding/base64"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/sandbox"
)

func TestRelKeepsPathsInsideTheProject(t *testing.T) {
	good := map[string]string{
		"/src/app.py":       "workspace/src/app.py",
		"src/app.py":        "workspace/src/app.py",
		"/a/../b.txt":       "workspace/b.txt",
		"/a//b/./c":         "workspace/a/b/c",
		"\\win\\style.txt":  "workspace/win/style.txt",
		"/.env":             "workspace/.env",
		"/name with spaces": "workspace/name with spaces",
	}
	for in, want := range good {
		got, err := Rel(in)
		if err != nil || got != want {
			t.Errorf("Rel(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "/", ".", "..", "/..", "../etc/passwd", "/../../etc/passwd", "/a/../../b", "/ok\x00/evil"} {
		if got, err := Rel(bad); err == nil {
			t.Errorf("Rel(%q) = %q; want it refused", bad, got)
		}
	}
}

func cmdMarker(command string) string {
	return "\x1b]7770;C;" + base64.StdEncoding.EncodeToString([]byte(command)) + "\x07"
}

func TestMarkerFilterTakesReportsOutOfTheStream(t *testing.T) {
	var f MarkerFilter
	out, markers := f.Feed([]byte("$ " + cmdMarker("pytest -q") + "2 passed\r\n" + "\x1b]7770;E;0\x07" + "$ "))
	if string(out) != "$ 2 passed\r\n$ " {
		t.Errorf("shown = %q", out)
	}
	if len(markers) != 2 || markers[0].Command != "pytest -q" || markers[1].Exit == nil || *markers[1].Exit != 0 {
		t.Errorf("markers = %+v", markers)
	}
}

func TestMarkerFilterHandlesASequenceSplitAcrossChunks(t *testing.T) {
	whole := "before" + cmdMarker("git status") + "middle" + "\x1b]7770;E;128\x07" + "after"
	// Every possible split point, so no boundary inside the introducer, the
	// payload or the terminator is missed.
	for cut := 1; cut < len(whole); cut++ {
		var f MarkerFilter
		var shown bytes.Buffer
		var got []Marker
		for _, part := range []string{whole[:cut], whole[cut:]} {
			out, markers := f.Feed([]byte(part))
			shown.Write(out)
			got = append(got, markers...)
		}
		if shown.String() != "beforemiddleafter" {
			t.Fatalf("cut %d: shown = %q", cut, shown.String())
		}
		if len(got) != 2 || got[0].Command != "git status" || got[1].Exit == nil || *got[1].Exit != 128 {
			t.Fatalf("cut %d: markers = %+v", cut, got)
		}
	}
}

func TestMarkerFilterLeavesOtherEscapeSequencesAlone(t *testing.T) {
	var f MarkerFilter
	// A colour code, a window-title OSC, and an OSC that merely starts like ours.
	in := "\x1b[31mred\x1b[0m \x1b]0;title\x07 \x1b]777;notify\x07 end"
	out, markers := f.Feed([]byte(in))
	if string(out) != in || len(markers) != 0 {
		t.Errorf("shown = %q, markers = %+v", out, markers)
	}
}

func TestMarkerFilterDropsAMalformedReportWithoutLosingOutput(t *testing.T) {
	var f MarkerFilter
	out, markers := f.Feed([]byte("a\x1b]7770;C;not base64!!\x07b\x1b]7770;E;abc\x07c\x1b]7770;X;1\x07d"))
	if string(out) != "abcd" || len(markers) != 0 {
		t.Errorf("shown = %q, markers = %+v", out, markers)
	}
}

// The real thing, against the real Daytona: a sandbox is created, seeded
// with a small task, read, written, run in, and deleted — and a terminal is
// opened in it to check that a command typed there comes back out as a
// report. It costs a sandbox, so it only runs when asked for:
//
//	DAYTONA_LIVE=1 go test ./internal/workspace -run Live -v
func TestLiveWorkspaceInARealSandbox(t *testing.T) {
	if os.Getenv("DAYTONA_LIVE") == "" {
		t.Skip("set DAYTONA_LIVE=1 to run this against Daytona")
	}
	config.LoadEnvFiles("../../.env.local", "../../.env")
	client := sandbox.New(os.Getenv("DAYTONA_API_KEY"), os.Getenv("DAYTONA_BASE_URL"))
	if !client.Configured() {
		t.Fatal("DAYTONA_API_KEY is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	sb, err := client.CreateSandbox(ctx, sandbox.CreateOptions{AutoStopInterval: 15, AutoDeleteInterval: 60, Labels: map[string]string{"mindfries": "live-test"}})
	if err != nil {
		t.Fatalf("creating a sandbox: %v", err)
	}
	defer func() {
		if err := client.DeleteSandbox(context.Background(), sb.ID); err != nil {
			t.Errorf("deleting the sandbox: %v", err)
		}
	}()
	if err := client.EnsureStarted(ctx, sb.ID); err != nil {
		t.Fatalf("waiting for the sandbox: %v", err)
	}

	w := Workspace{Client: client, SandboxID: sb.ID}
	started := time.Now()
	task := map[string]string{
		"/README.md":              "# Pricing\n",
		"/pricing/__init__.py":    "",
		"/pricing/discount.py":    "def apply(total, percent):\n    return total - total * percent\n",
		"/tests/__init__.py":      "",
		"/tests/test_discount.py": "import unittest\nfrom pricing.discount import apply\n\n\nclass T(unittest.TestCase):\n    def test_ten(self):\n        self.assertEqual(apply(200, 10), 180)\n",
		"/it's a file & more.txt": "odd name\n",
	}
	if err := w.Seed(ctx, task, "Asha Verma", "asha@example.com"); err != nil {
		t.Fatalf("seeding: %v", err)
	}
	t.Logf("seeded %d files in %s", len(task), time.Since(started).Round(time.Millisecond))

	entries, truncated, err := w.Manifest(ctx)
	if err != nil || truncated {
		t.Fatalf("manifest: %v truncated=%v", err, truncated)
	}
	var listed []string
	for _, e := range entries {
		listed = append(listed, e.Path)
	}
	if len(entries) != len(task) {
		t.Errorf("manifest lists %d files, want %d: %v", len(entries), len(task), listed)
	}

	res, err := w.Run(ctx, "git log --format='%an|%s' && git status --porcelain | wc -l && git config user.name", 30)
	if err != nil || !strings.Contains(res.Output, "Mindfries|Task as given") || !strings.Contains(res.Output, "Asha Verma") {
		t.Errorf("git setup: %v %q", err, res.Output)
	}

	res, err = w.Run(ctx, "python3 -m unittest discover -s tests 2>&1", 60)
	if err != nil || res.ExitCode == 0 || !strings.Contains(res.Output, "FAILED") {
		t.Errorf("the task's test should fail as given: %v exit=%d %q", err, res.ExitCode, res.Output)
	}

	if err := w.Write(ctx, "/pricing/discount.py", "def apply(total, percent):\n    return total - total * percent / 100\n"); err != nil {
		t.Fatalf("write: %v", err)
	}
	res, err = w.Run(ctx, "python3 -m unittest discover -s tests 2>&1", 60)
	if err != nil || res.ExitCode != 0 {
		t.Errorf("the test should pass once fixed: %v exit=%d %q", err, res.ExitCode, res.Output)
	}

	// Something only a real machine can do: install a package from the internet and use it.
	res, err = w.Run(ctx, "pip install -q --disable-pip-version-check requests 2>&1 | tail -2; python3 -c 'import requests; print(\"requests\", requests.__version__)'", 120)
	if err != nil || !strings.Contains(res.Output, "requests ") {
		t.Errorf("pip install from the internet: %v %q", err, res.Output)
	} else {
		t.Logf("installed and imported: %s", strings.TrimSpace(res.Output[strings.LastIndex(res.Output, "requests "):]))
	}

	if err := w.Move(ctx, "/README.md", "/docs/README.md"); err != nil {
		t.Errorf("move: %v", err)
	}
	if err := w.Delete(ctx, "/it's a file & more.txt"); err != nil {
		t.Errorf("delete: %v", err)
	}
	// Dependencies must not show up as the candidate's files.
	if _, err := w.Run(ctx, "mkdir -p node_modules/x && echo junk > node_modules/x/index.js && printf '\\x00\\x01\\x02' > blob.bin", 30); err != nil {
		t.Errorf("making ignored files: %v", err)
	}

	files, complete, err := w.Snapshot(ctx)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if !strings.Contains(files["/pricing/discount.py"], "/ 100") {
		t.Errorf("the snapshot should hold the fixed file, got %q", files["/pricing/discount.py"])
	}
	if _, ok := files["/docs/README.md"]; !ok {
		t.Errorf("the moved file is missing from the snapshot")
	}
	for p := range files {
		if strings.Contains(p, "node_modules") || p == "/README.md" || strings.Contains(p, "it's a file") || p == "/blob.bin" {
			t.Errorf("%s should not be in the snapshot", p)
		}
	}
	if complete {
		t.Errorf("a snapshot that left a binary file out should say it is not complete")
	}

	// A terminal: what is typed runs, and the shell reports it.
	pty, err := client.OpenPTY(ctx, sb.ID, sandbox.PTYOptions{ID: "live-test", Cwd: "/home/daytona/" + Dir, Cols: 100, Rows: 30, Envs: map[string]string{"TERM": "xterm-256color"}})
	if err != nil {
		t.Fatalf("opening a terminal: %v", err)
	}
	var filter MarkerFilter
	var shown bytes.Buffer
	var markers []Marker
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			chunk, err := pty.Read()
			if err != nil {
				return
			}
			out, ms := filter.Feed(chunk)
			shown.Write(out)
			markers = append(markers, ms...)
		}
	}()
	time.Sleep(1500 * time.Millisecond)
	if err := pty.Write([]byte("echo terminal-$((6*7)); false\r")); err != nil {
		t.Fatalf("typing: %v", err)
	}
	time.Sleep(2500 * time.Millisecond)
	if err := pty.Resize(ctx, 140, 40); err != nil {
		t.Errorf("resize: %v", err)
	}
	pty.Close()
	<-done

	if !strings.Contains(shown.String(), "terminal-42") {
		t.Errorf("the terminal should show the command's output, got %q", shown.String())
	}
	if strings.Contains(shown.String(), "7770") {
		t.Errorf("a report leaked into what the candidate sees: %q", shown.String())
	}
	var ran string
	var lastExit *int
	for _, m := range markers {
		if m.Command != "" {
			ran = m.Command
		} else if ran != "" {
			lastExit = m.Exit
		}
	}
	if ran != "echo terminal-$((6*7)); false" || lastExit == nil || *lastExit != 1 {
		t.Errorf("the shell should report the command and its exit status 1; got command %q, exit %v, markers %+v", ran, lastExit, markers)
	}
	if !strings.Contains(shown.String(), "~/workspace") {
		t.Errorf("the prompt should show the project path, got %q", shown.String())
	}
}
