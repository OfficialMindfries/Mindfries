package orchestrator

import (
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

func TestIsAbandoned(t *testing.T) {
	start := time.Date(2026, 10, 7, 9, 0, 0, 0, time.UTC)
	sess := db.Session{StartedAt: start, DurationMin: 60}
	cfg := db.DefaultInterviewConfig() // 4 questions × (120s + 45s) = 11 minutes of interview
	timeUp := start.Add(60 * time.Minute)
	interviewEnds := timeUp.Add(11 * time.Minute)

	cases := []struct {
		name string
		now  time.Time
		want bool
	}{
		{"still working", start.Add(30 * time.Minute), false},
		{"time just ran out — the interview may be starting", timeUp.Add(time.Second), false},
		{"mid-interview after time-up", timeUp.Add(8 * time.Minute), false},
		{"interview allowance over, within the grace", interviewEnds.Add(time.Minute), false},
		{"past the grace", interviewEnds.Add(abandonGrace + time.Second), true},
		{"hours later", timeUp.Add(5 * time.Hour), true},
	}
	for _, c := range cases {
		if got := isAbandoned(sess, cfg, c.now); got != c.want {
			t.Errorf("%s: isAbandoned = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestIsAbandonedAllowsALongerConfiguredInterview(t *testing.T) {
	start := time.Date(2026, 10, 7, 9, 0, 0, 0, time.UTC)
	sess := db.Session{StartedAt: start, DurationMin: 60}
	long := db.InterviewConfig{Questions: 8, AnswerSeconds: 600} // 8 × 645s = 86 minutes
	at := start.Add(60*time.Minute + 30*time.Minute)

	if isAbandoned(sess, long, at) {
		t.Error("a role with a long interview was closed while that interview could still be running")
	}
	if !isAbandoned(sess, db.DefaultInterviewConfig(), at) {
		t.Error("the default interview's allowance had passed, but the session was left open")
	}
}
