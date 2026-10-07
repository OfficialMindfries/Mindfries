package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

var t0 = time.Date(2026, 10, 7, 10, 0, 0, 0, time.UTC)

func interviewEvent(at time.Time, turn Turn) db.ActivityEvent {
	raw, _ := json.Marshal(turn)
	return db.ActivityEvent{EventType: eventInterview, Payload: raw, OccurredAt: at}
}

// The paths below all return before a turn is recorded or a model is
// called, so they run against an Orchestrator with no database behind it.
func step(t *testing.T, sess db.Session, cfg db.InterviewConfig, events []db.ActivityEvent, answer InterviewAnswer, now time.Time) (InterviewState, error) {
	t.Helper()
	return (&Orchestrator{}).interviewStep(context.Background(), sess, cfg, events, answer, now)
}

func TestInterviewResumesTheWaitingQuestionWithTheTimeActuallyLeft(t *testing.T) {
	cfg := db.InterviewConfig{Questions: 5, Tone: "neutral", Language: "hi-IN", AnswerSeconds: 90}
	sess := db.Session{StartedAt: t0, DurationMin: 60}
	events := []db.ActivityEvent{interviewEvent(t0.Add(10*time.Minute), Turn{Role: roleInterviewer, Text: "Why that fix?"})}

	state, err := step(t, sess, cfg, events, InterviewAnswer{}, t0.Add(10*time.Minute+30*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if state.Question != "Why that fix?" || state.Asked != 1 || state.Total != 5 {
		t.Errorf("should hand back the same question, got %+v", state)
	}
	if state.SecondsLeft != 60 {
		t.Errorf("30s of a 90s limit have gone; SecondsLeft = %d, want 60", state.SecondsLeft)
	}
	if state.Language != "hi-IN" || state.AnswerSeconds != 90 {
		t.Errorf("the role's settings should reach the client, got %+v", state)
	}

	late, _ := step(t, sess, cfg, events, InterviewAnswer{}, t0.Add(20*time.Minute))
	if late.SecondsLeft != 0 {
		t.Errorf("time left never goes negative, got %d", late.SecondsLeft)
	}
}

func TestInterviewRefusesAnAnswerWithNoQuestionWaiting(t *testing.T) {
	cfg := db.DefaultInterviewConfig()
	answered := []db.ActivityEvent{
		interviewEvent(t0, Turn{Role: roleInterviewer, Text: "Q1"}),
		interviewEvent(t0.Add(time.Minute), Turn{Role: roleCandidate, Text: "A1"}),
	}
	for name, events := range map[string][]db.ActivityEvent{"before any question": nil, "after the last one was answered": answered} {
		for _, answer := range []InterviewAnswer{{Text: "hello"}, {Skipped: true}} {
			if _, err := step(t, db.Session{StartedAt: t0, DurationMin: 60}, cfg, events, answer, t0.Add(2*time.Minute)); !errors.Is(err, ErrNoQuestionWaiting) {
				t.Errorf("%s, answer %+v: err = %v, want ErrNoQuestionWaiting", name, answer, err)
			}
		}
	}
}

func TestInterviewIsDoneAfterTheConfiguredNumberOfQuestions(t *testing.T) {
	cfg := db.InterviewConfig{Questions: 2, Tone: "neutral", Language: "en-US", AnswerSeconds: 120}
	events := []db.ActivityEvent{
		interviewEvent(t0, Turn{Role: roleInterviewer, Text: "Q1"}),
		interviewEvent(t0.Add(1*time.Minute), Turn{Role: roleCandidate, Text: "A1"}),
		interviewEvent(t0.Add(2*time.Minute), Turn{Role: roleInterviewer, Text: "Q2"}),
		interviewEvent(t0.Add(3*time.Minute), Turn{Role: roleCandidate, Text: "A2"}),
	}
	state, err := step(t, db.Session{StartedAt: t0, DurationMin: 60}, cfg, events, InterviewAnswer{}, t0.Add(4*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if !state.Done || state.CutShort || state.Asked != 2 || state.Total != 2 {
		t.Errorf("two of two answered should be a normal finish, got %+v", state)
	}
}

func TestInterviewIsCutShortOnceTheSessionIsOutOfTime(t *testing.T) {
	cfg := db.InterviewConfig{Questions: 4, Tone: "neutral", Language: "en-US", AnswerSeconds: 120}
	sess := db.Session{StartedAt: t0, DurationMin: 60}
	oneAnswered := []db.ActivityEvent{
		interviewEvent(t0.Add(59*time.Minute), Turn{Role: roleInterviewer, Text: "Q1"}),
		interviewEvent(t0.Add(60*time.Minute), Turn{Role: roleCandidate, Text: "A1"}),
	}

	deadline := interviewDeadline(sess, cfg)
	if want := t0.Add(60*time.Minute + 4*(120*time.Second+perQuestionOverhead)); !deadline.Equal(want) {
		t.Fatalf("deadline = %v, want session end plus one whole interview (%v)", deadline, want)
	}

	state, err := step(t, sess, cfg, oneAnswered, InterviewAnswer{}, deadline.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if !state.Done || !state.CutShort || state.Asked != 1 {
		t.Errorf("past the deadline with questions left should close the interview as cut short, got %+v", state)
	}
}

func TestFormatTranscriptShowsHowLongAnswersTook(t *testing.T) {
	got := formatTranscript([]Turn{
		{Role: roleInterviewer, Text: "Why?"},
		{Role: roleCandidate, Text: "Because.", Seconds: 42},
		{Role: roleInterviewer, Text: "And then?"},
		{Role: roleCandidate, Text: "Long story", Seconds: 200, TimedOut: true},
		{Role: roleInterviewer, Text: "Anything else?"},
		{Role: roleCandidate, Text: noAnswerText, Seconds: 121, TimedOut: true},
	})
	for _, want := range []string{
		"Interviewer: Why?\n",
		"Candidate: Because. [answered in 42s]\n",
		"Candidate: Long story [answered in 200s, over the time limit]\n",
		"Candidate: " + noAnswerText + "\n",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("transcript missing %q:\n%s", want, got)
		}
	}
}
