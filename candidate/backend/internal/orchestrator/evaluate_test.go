package orchestrator

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

func eventAt(at time.Time, eventType string, payload any) db.ActivityEvent {
	raw, _ := json.Marshal(payload)
	return db.ActivityEvent{EventType: eventType, Payload: raw, OccurredAt: at}
}

func TestDigestEventsCollapsesRepeatedAutoSaves(t *testing.T) {
	var events []db.ActivityEvent
	for i := 0; i < 40; i++ {
		events = append(events, eventAt(t0.Add(time.Duration(i)*time.Second), "file_edit", map[string]any{"paths": []string{"/a.py"}}))
	}
	events = append(events, eventAt(t0.Add(time.Minute), "file_edit", map[string]any{"paths": []string{"/b.py"}}))

	_, trail := digestEvents(events, nil)
	lines := strings.Split(trail, "\n")
	if len(lines) != 2 {
		t.Fatalf("40 identical saves and one different should be two lines, got %d:\n%s", len(lines), trail)
	}
	if !strings.Contains(lines[0], "(×40)") || !strings.Contains(lines[0], "10:00:00–10:00:39") {
		t.Errorf("the run should carry its count and time span: %s", lines[0])
	}
	if strings.Contains(lines[1], "×") {
		t.Errorf("a single event shouldn't be marked as a run: %s", lines[1])
	}
}

func TestDigestEventsLeavesPlatformBookkeepingOutOfTheTrail(t *testing.T) {
	events := []db.ActivityEvent{
		eventAt(t0, "file_edit", map[string]any{"paths": []string{"/a.py"}}),
		eventAt(t0.Add(time.Second), eventAICost, llm.Usage{Agent: "assistant", Model: "m", CostUSD: 0.01}),
		eventAt(t0.Add(2*time.Second), eventInterviewRecording, map[string]any{"path": "s/q1.webm"}),
	}
	_, trail := digestEvents(events, nil)
	if strings.Contains(trail, eventAICost) || strings.Contains(trail, "q1.webm") {
		t.Errorf("what a call cost and where a recording went aren't things the candidate did:\n%s", trail)
	}
	if !strings.Contains(trail, "file_edit") {
		t.Errorf("the candidate's own action is missing:\n%s", trail)
	}
}

func TestClipMiddleKeepsTheStartAndEndAndSaysWhatWent(t *testing.T) {
	var lines []string
	for i := 0; i < 1000; i++ {
		lines = append(lines, fmt.Sprintf("[line %04d] the candidate did something here", i))
	}
	text := strings.Join(lines, "\n")

	got := clipMiddle(text, 3000)
	if len(got) > 3300 {
		t.Fatalf("clipped text is %d chars, want about 3000", len(got))
	}
	if !strings.HasPrefix(got, lines[0]) || !strings.HasSuffix(got, lines[999]) {
		t.Error("the first and last lines must survive")
	}
	if !strings.Contains(got, "lines omitted here") {
		t.Errorf("the cut must be stated:\n%s", got[:400])
	}
	head := strings.Index(got, "[…")
	if tail := len(got) - head; tail < head {
		t.Errorf("more of the budget should go to the end of the session than the start (head %d, tail %d)", head, tail)
	}
	for _, l := range strings.Split(got, "\n") {
		if !strings.HasPrefix(l, "[line ") && !strings.HasPrefix(l, "[…") {
			t.Fatalf("a line was cut in half: %q", l)
		}
	}

	if short := "nothing to cut"; clipMiddle(short, 3000) != short {
		t.Error("text within the limit must come back unchanged")
	}
	if one := clipMiddle(strings.Repeat("x", 10_000), 900); len(one) > 1000 || !strings.Contains(one, "cut for length") {
		t.Errorf("a single over-long line should be cut by characters, got %d chars", len(one))
	}
}

func TestParseRubricDropsCriteriaThatCannotBeScored(t *testing.T) {
	raw := json.RawMessage(`[{"id":"c1","label":"Correctness","weight":60},{"id":"c2","label":"  ","weight":20},{"id":"","label":"Testing","weight":20}]`)
	got := parseRubric(raw)
	if len(got) != 1 || got[0].Label != "Correctness" || got[0].Weight != 60 {
		t.Fatalf("parseRubric = %+v", got)
	}
	for _, empty := range []json.RawMessage{nil, json.RawMessage(`[]`), json.RawMessage(`not json`)} {
		if parseRubric(empty) != nil && len(parseRubric(empty)) != 0 {
			t.Errorf("parseRubric(%q) should be empty", empty)
		}
	}
}

func TestFormatScorecardLeadsWithTheWeightedOverall(t *testing.T) {
	got := formatScorecard([]llm.RubricScore{
		{Label: "Correctness", Weight: 60, Score: 90, Reason: "The fix is right."},
		{Label: "Testing", Weight: 40, Score: 50, Reason: "Ran the suite once."},
	})
	for _, want := range []string{"Overall: 74/100", "Correctness (weight 60) — 90/100. The fix is right.", "Testing (weight 40) — 50/100. Ran the suite once."} {
		if !strings.Contains(got, want) {
			t.Errorf("scorecard missing %q:\n%s", want, got)
		}
	}
}
