package orchestrator

import (
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

const replyWithCode = "A sliding window keeps a timestamp per request. For example:\n" +
	"```python\n" +
	"window_start = now - self.window_seconds\n" +
	"recent = [t for t in self.hits if t > window_start]\n" +
	"return x\n" +
	"# drop anything older than the window\n" +
	"def allow(self, key):\n" +
	"```\n" +
	"That is a generic illustration, not your code."

func TestOfferedLinesKeepsOnlyCodeNewToTheProject(t *testing.T) {
	existing := codeLineSet(map[string]string{"/gateway/limiter.py": "class Limiter:\n    def allow(self, key):\n        return True\n"})
	got := offeredLines(replyWithCode, existing)
	want := []string{"window_start = now - self.window_seconds", "recent = [t for t in self.hits if t > window_start]"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("got %q\nwant %q — prose, comments, short lines and the candidate's own code are not 'offered'", got, want)
	}
	if lines := offeredLines("Just prose with `inline_code_mentioned()` and no block.", nil); len(lines) != 0 {
		t.Errorf("a reply with no code block offers nothing, got %q", lines)
	}
}

func uptakeEvents(finalFiles map[string]string, copies int) []db.ActivityEvent {
	events := []db.ActivityEvent{
		eventAt(t0, eventAIUsage, Turn{Role: roleCandidate, Text: "how does a sliding window work?"}),
		eventAt(t0.Add(time.Second), eventAIUsage, Turn{Role: roleAssistant, Text: replyWithCode, Offered: offeredLines(replyWithCode, codeLineSet(map[string]string{"/gateway/limiter.py": "    def allow(self, key):"}))}),
		eventAt(t0.Add(time.Minute), eventAIUsage, Turn{Role: roleCandidate, Text: "what does this error mean?"}),
		eventAt(t0.Add(time.Minute+time.Second), eventAIUsage, Turn{Role: roleAssistant, Text: "It means the assertion compared two different values."}),
	}
	for i := 0; i < copies; i++ {
		events = append(events, eventAt(t0.Add(2*time.Minute), eventAssistantCopy, map[string]any{"chars": 80}))
	}
	if finalFiles != nil {
		events = append(events, eventAt(t0.Add(10*time.Minute), eventSnapshot, snapshotPayload{Files: finalFiles}))
	}
	return events
}

func TestAssistantUptakeFindsTheAssistantsCodeInTheSubmission(t *testing.T) {
	got := assistantUptake(uptakeEvents(map[string]string{
		"/gateway/limiter.py": "class Limiter:\n    def allow(self, key):\n        window_start   = now - self.window_seconds\n        return self.count < 3\n",
	}, 2))
	for _, want := range []string{"sent the assistant 2 messages", "2 lines of code new to their project", "1 of them appears word for word", "- /gateway/limiter.py: window_start = now - self.window_seconds", "copied text out of the assistant panel 2 times"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
}

func TestAssistantUptakeSaysSoWhenNothingWasUsed(t *testing.T) {
	got := assistantUptake(uptakeEvents(map[string]string{"/gateway/limiter.py": "class Limiter:\n    pass\n"}, 0))
	if !strings.Contains(got, "none of them appear in the submitted work") || strings.Contains(got, "copied") {
		t.Errorf("got:\n%s", got)
	}
}

func TestAssistantUptakeDoesNotGuessWithoutASubmission(t *testing.T) {
	got := assistantUptake(uptakeEvents(nil, 0))
	if !strings.Contains(got, "no copy of the submitted work was recorded") {
		t.Errorf("with nothing to compare against it should say so, got:\n%s", got)
	}
}

func TestAssistantUptakeIsEmptyWhenTheAssistantWasNeverUsed(t *testing.T) {
	events := []db.ActivityEvent{eventAt(t0, "file_edit", map[string]any{"paths": []string{"/a.py"}})}
	if got := assistantUptake(events); got != "" {
		t.Errorf("nothing to report, got %q", got)
	}
}
