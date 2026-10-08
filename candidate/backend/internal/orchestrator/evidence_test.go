package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

func withID(id int64, e db.ActivityEvent) db.ActivityEvent {
	e.ID = id
	return e
}

func TestTrailEntriesCarryAReferenceAnAgentCanCite(t *testing.T) {
	events := []db.ActivityEvent{
		withID(41, eventAt(t0, "test_run", map[string]any{"passed": 3, "failed": 1})),
		withID(42, eventAt(t0.Add(time.Second), "file_edit", map[string]any{"paths": []string{"/a.py"}})),
		withID(43, eventAt(t0.Add(2*time.Second), "file_edit", map[string]any{"paths": []string{"/a.py"}})),
	}
	_, trail := digestEvents(events, nil)
	lines := strings.Split(trail, "\n")
	if len(lines) != 2 || !strings.HasPrefix(lines[0], "[E41] ") || !strings.HasPrefix(lines[1], "[E42] ") || !strings.Contains(lines[1], "(×2)") {
		t.Errorf("each entry should open with its event's reference, a collapsed run with its first:\n%s", trail)
	}
}

func TestInterviewTranscriptLabelsEachTurn(t *testing.T) {
	events := []db.ActivityEvent{
		withID(7, eventAt(t0, eventInterview, Turn{Role: roleInterviewer, Text: "Why that fix?"})),
		withID(8, eventAt(t0.Add(time.Minute), eventInterview, Turn{Role: roleCandidate, Text: "It was off by one.", Seconds: 40})),
		withID(9, eventAt(t0.Add(time.Minute), "file_edit", map[string]any{})),
	}
	got := interviewTranscript(events)
	want := "[E7] Interviewer: Why that fix?\n[E8] Candidate: It was off by one. [answered in 40s]\n"
	if got != want {
		t.Errorf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestKeepKnownRefsDropsCitationsOfThingsThatAreNotThere(t *testing.T) {
	known := map[int64]bool{41: true, 42: true}
	cases := map[string]string{
		"Ran the tests before editing [E41].":                  "Ran the tests before editing [E41].",
		"Ran the tests first [E41, E42] and again [E999].":     "Ran the tests first [E41] [E42] and again.",
		"Edited twice [E41–E42], then stopped [E7] for a bit.": "Edited twice [E41] [E42], then stopped for a bit.",
		"An array index like a[E] or [0] is not a reference.":  "An array index like a[E] or [0] is not a reference.",
	}
	for in, want := range cases {
		if got := keepKnownRefs(in, known); got != want {
			t.Errorf("keepKnownRefs(%q)\n got %q\nwant %q", in, got, want)
		}
	}
	if got := stripRefs("Fixed the bug [E41] cleanly."); got != "Fixed the bug cleanly." {
		t.Errorf("stripRefs = %q", got)
	}
}

func interviewEvents(turns ...Turn) []db.ActivityEvent {
	var out []db.ActivityEvent
	for i, turn := range turns {
		out = append(out, eventAt(t0.Add(time.Duration(i)*time.Minute), eventInterview, turn))
	}
	return out
}

func TestInterviewStatusFlagsOnlyWhatWentWrong(t *testing.T) {
	cfg := db.InterviewConfig{Questions: 2, AnswerSeconds: 60}
	q, a := Turn{Role: roleInterviewer, Text: "Q"}, Turn{Role: roleCandidate, Text: "A", Seconds: 20}
	autoSubmit := eventAt(t0.Add(time.Hour), eventAutoSubmitted, map[string]any{})

	if got := interviewStatus(interviewEvents(q, a, q, a), cfg); got != "" {
		t.Errorf("a complete interview needs no flag, got %q", got)
	}
	cases := []struct {
		name   string
		events []db.ActivityEvent
		want   []string
	}{
		{"never held", nil, []string{"No interview took place", "could not be reached"}},
		{"abandoned before it", []db.ActivityEvent{autoSubmit}, []string{"No interview took place", "closed by the server"}},
		{"ran out of time", interviewEvents(q, a), []string{"cut short: 1 of 2 questions", "time allowed for it ran out"}},
		{"left midway", append(interviewEvents(q), autoSubmit), []string{"cut short: 1 of 2", "closed by the server", "never answered"}},
		{"an answer missed", interviewEvents(q, Turn{Role: roleCandidate, Text: noAnswerText, TimedOut: true}, q, a), []string{"1 question went unanswered"}},
		{"an answer late", interviewEvents(q, Turn{Role: roleCandidate, Text: "long", Seconds: 200, TimedOut: true}, q, a), []string{"1 answer ran past the time limit"}},
	}
	for _, c := range cases {
		got := interviewStatus(c.events, cfg)
		for _, want := range c.want {
			if !strings.Contains(got, want) {
				t.Errorf("%s: missing %q in %q", c.name, want, got)
			}
		}
	}
}

func TestProvenanceSignalsReportsLargeOutsidePastesAndAbsences(t *testing.T) {
	events := []db.ActivityEvent{
		withID(1, eventAt(t0, eventPaste, pasteEvent{Chars: 30, Lines: 1, Target: "/a.py"})),                                     // small: counted, not listed
		withID(2, eventAt(t0.Add(time.Minute), eventPaste, pasteEvent{Chars: 900, Lines: 30, Internal: true, Target: "/a.py"})),  // moved within the workspace
		withID(3, eventAt(t0.Add(5*time.Minute), eventTabHidden, map[string]any{"seconds": 240})),                                // four minutes away
		withID(4, eventAt(t0.Add(5*time.Minute+8*time.Second), eventPaste, pasteEvent{Chars: 1200, Lines: 42, Target: "/a.py"})), // straight after
		withID(5, eventAt(t0.Add(20*time.Minute), eventTabHidden, map[string]any{"seconds": 12})),                                // a glance elsewhere
		withID(6, eventAt(t0.Add(30*time.Minute), eventPaste, pasteEvent{Chars: 400, Lines: 3, Target: "the assistant's message box"})),
	}
	got := provenanceSignals(events)
	for _, want := range []string{
		"They are not findings",
		"2 large pastes of text copied from outside the workspace (1630 characters pasted from outside in all)",
		"1200 characters over 42 lines into /a.py", "[E4]", "8 seconds after returning from 4m0s away",
		"400 characters over 3 lines into the assistant's message box", "[E6]",
		"1 of these came within 20 seconds",
		"left for more than a minute 1 time; the longest was 4m0s, and 4m12s in total",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
	if strings.Contains(got, "[E2]") || strings.Contains(got, "[E1]") {
		t.Errorf("a small paste and one from inside the workspace aren't signals:\n%s", got)
	}
}

func TestProvenanceSignalsStaysQuietWithNothingNotable(t *testing.T) {
	if got := provenanceSignals([]db.ActivityEvent{eventAt(t0, "file_edit", map[string]any{})}); got != "" {
		t.Errorf("no paste or focus telemetry at all should say nothing, got %q", got)
	}
	quiet := []db.ActivityEvent{
		eventAt(t0, eventPaste, pasteEvent{Chars: 20, Lines: 1}),
		eventAt(t0, eventTabHidden, map[string]any{"seconds": 5}),
	}
	if got := provenanceSignals(quiet); got != "" {
		t.Errorf("a small paste and a five-second glance aren't worth a reviewer's time, got %q", got)
	}
}

func TestRetryOnceTriesAFailedAgentAgainButNotAPointlessOne(t *testing.T) {
	old := retryDelay
	retryDelay = 0
	t.Cleanup(func() { retryDelay = old })
	ctx := context.Background()

	calls := 0
	out, err := retryOnce(ctx, func() (string, error) {
		calls++
		if calls == 1 {
			return "", errors.New("llm: openrouter http 429")
		}
		return "observations", nil
	})
	if err != nil || out != "observations" || calls != 2 {
		t.Errorf("a rate-limited call should be tried again: %q, %v, %d calls", out, err, calls)
	}

	for name, failure := range map[string]error{
		"nothing to analyse": fmt.Errorf("%w: no interview", llm.ErrNothingToAnalyze),
		"no key":             llm.ErrNotConfigured,
	} {
		calls = 0
		if _, err := retryOnce(ctx, func() (string, error) { calls++; return "", failure }); err == nil || calls != 1 {
			t.Errorf("%s: a second attempt can't help, but it was called %d times", name, calls)
		}
	}

	calls = 0
	if _, err := retryOnce(ctx, func() (string, error) { calls++; return "", errors.New("still down") }); err == nil || calls != 2 {
		t.Errorf("two failures is the end of it: %v after %d calls", err, calls)
	}
}
