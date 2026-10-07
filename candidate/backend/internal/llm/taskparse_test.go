package llm

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseGeneratedTaskAcceptsFileMarkersWithoutAClosingRun(t *testing.T) {
	// The shape the real model returned on 2026-10-07: a closed BRIEF marker,
	// then file markers with no trailing "=====".
	raw := "=====BRIEF=====\n# Task\n=====FILE: gateway/limiter.py\nclass Limiter:\n    pass\n=====FILE: tests/__init__.py\n=====FILE: README.md\nRead me\n"
	task := parseGeneratedTask(raw)

	if task.TaskBrief != "# Task" {
		t.Errorf("brief = %q", task.TaskBrief)
	}
	if got := task.StarterFiles["gateway/limiter.py"]; got != "class Limiter:\n    pass\n" {
		t.Errorf("limiter.py = %q", got)
	}
	if _, ok := task.StarterFiles["tests/__init__.py"]; !ok {
		t.Error("an empty file should still exist — a package marker is a real file")
	}
	if len(task.StarterFiles) != 3 {
		t.Errorf("want 3 files, got %d: %v", len(task.StarterFiles), task.StarterFiles)
	}
}

func TestParseGeneratedTaskLeavesCodeThatLooksLikeAMarkerAlone(t *testing.T) {
	raw := "=====BRIEF=====\nb\n=====FILE: a.py=====\nprint('=' * 20)\nx = {'FILE': 1}\n# ===== section =====\n"
	task := parseGeneratedTask(raw)
	if len(task.StarterFiles) != 1 {
		t.Fatalf("a comment rule inside a file was read as a new file: %v", task.StarterFiles)
	}
}

// TestMaterializeRawReply is a manual aid, skipped unless LLM_RAW_REPLY and
// LLM_OUT_DIR are set: it writes a saved model reply out as real files so the
// generated codebase can be run.
func TestMaterializeRawReply(t *testing.T) {
	src, out := os.Getenv("LLM_RAW_REPLY"), os.Getenv("LLM_OUT_DIR")
	if src == "" || out == "" {
		t.Skip("set LLM_RAW_REPLY and LLM_OUT_DIR to use")
	}
	raw, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	task := parseGeneratedTask(string(raw))
	if task.TaskBrief == "" || len(task.StarterFiles) == 0 {
		t.Fatal("reply did not parse into a brief and files")
	}
	for p, c := range task.StarterFiles {
		full := filepath.Join(out, filepath.FromSlash(p))
		os.MkdirAll(filepath.Dir(full), 0o755)
		if err := os.WriteFile(full, []byte(c), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("%s (%d bytes)", p, len(c))
	}
	os.WriteFile(filepath.Join(out, "_BRIEF.md"), []byte(task.TaskBrief), 0o644)
}
