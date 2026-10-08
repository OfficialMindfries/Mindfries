package orchestrator

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

func event(eventType string, payload any) db.ActivityEvent {
	raw, _ := json.Marshal(payload)
	return db.ActivityEvent{EventType: eventType, Payload: raw, OccurredAt: time.Unix(0, 0).UTC()}
}

func TestDescribeWorkReportsNewModifiedAndDeleted(t *testing.T) {
	starter := map[string]string{"/src/a.js": "old", "/src/keep.js": "same", "/src/gone.js": "x"}
	snap := &snapshotPayload{Files: map[string]string{"/src/a.js": "new", "/src/keep.js": "same", "/src/b.js": "added"}}

	got := describeWork(snap, starter)
	for _, want := range []string{"src/a.js (modified)", "--- as given\nold", "--- as submitted\nnew", "src/b.js (new file)", "src/gone.js (deleted)"} {
		if !strings.Contains(got, want) {
			t.Errorf("describeWork output missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "keep.js") {
		t.Errorf("an unchanged file should not be listed:\n%s", got)
	}
}

func TestDescribeWorkSaysWhenNothingChanged(t *testing.T) {
	starter := map[string]string{"/a.py": "print(1)"}
	got := describeWork(&snapshotPayload{Files: map[string]string{"/a.py": "print(1)"}}, starter)
	if !strings.Contains(got, "made no changes") {
		t.Fatalf("expected an explicit no-changes statement, got %q", got)
	}
	if describeWork(nil, starter) != "" {
		t.Fatal("no snapshot at all should describe nothing, not claim there were no changes")
	}
}

func TestDescribeWorkDoesNotCallASkippedFileDeleted(t *testing.T) {
	starter := map[string]string{"/big.json": "{}"}
	got := describeWork(&snapshotPayload{Files: map[string]string{}, Skipped: []string{"/big.json"}}, starter)
	if strings.Contains(got, "(deleted)") {
		t.Fatalf("a file skipped for size was reported as deleted:\n%s", got)
	}
	if !strings.Contains(got, "big.json") {
		t.Fatalf("skipped files should be named:\n%s", got)
	}
}

func TestDigestEventsUsesLatestSnapshotAndKeepsInterviewOutOfTheTrail(t *testing.T) {
	events := []db.ActivityEvent{
		event("file_edit", map[string]any{"paths": []string{"/a.js"}}),
		event(eventSnapshot, snapshotPayload{Files: map[string]string{"/a.js": "first"}}),
		event(eventAIUsage, Turn{Role: roleCandidate, Text: "why does this fail?"}),
		event(eventInterview, Turn{Role: roleInterviewer, Text: "Why that approach?"}),
		event(eventSnapshot, snapshotPayload{Files: map[string]string{"/a.js": "final"}}),
		event("terminal", map[string]string{"blob": strings.Repeat("x", 5000)}),
	}

	work, trail := digestEvents(events, map[string]string{"/a.js": "given"})
	if !strings.Contains(work, "final") || strings.Contains(work, "first") {
		t.Errorf("work should reflect only the latest snapshot:\n%s", work)
	}
	if strings.Contains(trail, "Why that approach?") || strings.Contains(trail, eventSnapshot) {
		t.Errorf("trail should leave out the interview and snapshots:\n%s", trail)
	}
	if !strings.Contains(trail, "why does this fail?") {
		t.Errorf("trail should keep AI usage:\n%s", trail)
	}
	if len(trail) > 2500 {
		t.Errorf("a large payload should be clipped, trail is %d bytes", len(trail))
	}
}

func TestDigestEventsFallsBackToGitDiffsWithoutASnapshot(t *testing.T) {
	work, _ := digestEvents([]db.ActivityEvent{event("git", map[string]string{"diff": "+added line"})}, nil)
	if work != "+added line" {
		t.Fatalf("work = %q, want the git diff", work)
	}
}

func TestTurnsOfIgnoresOtherEventsAndEmptyTurns(t *testing.T) {
	turns := turnsOf([]db.ActivityEvent{
		event(eventAIUsage, Turn{Role: roleCandidate, Text: "hi"}),
		event("file_edit", map[string]string{"text": "not a turn"}),
		event(eventAIUsage, Turn{Role: roleAssistant, Text: ""}),
		event(eventAIUsage, Turn{Role: roleAssistant, Text: "hello"}),
	}, eventAIUsage)
	if len(turns) != 2 || turns[0].Text != "hi" || turns[1].Role != roleAssistant {
		t.Fatalf("unexpected turns: %+v", turns)
	}
}
