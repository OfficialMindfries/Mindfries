package orchestrator

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

// A session is normally submitted by the candidate's browser: on Submit, or
// by itself when the timer reaches zero. A candidate who closes the tab
// before either leaves the session "live" for ever — no report, and a
// pipeline row that says "in progress" about someone who left an hour ago.
// The sweep below is the server doing what the browser would have done:
// submitting the work as it last stood.

const (
	// abandonGrace is how long past the last moment the browser could still
	// legitimately be working (see interviewDeadline) a session is left
	// alone, so the sweep never races a submit that is on its way.
	abandonGrace = 2 * time.Minute

	// abandonMaxAge bounds how far back the sweep looks — see
	// db.ListLiveSessionsPastTime.
	abandonMaxAge = 7 * 24 * time.Hour

	// eventAutoSubmitted marks, in the session's own trail, that the server
	// closed it. The hiring team should know the candidate didn't press
	// Submit, and the workflow agent reads the trail too.
	eventAutoSubmitted = "auto_submitted"
)

// isAbandoned reports whether a live session is past the point where its
// candidate could still be working or being interviewed.
func isAbandoned(sess db.Session, cfg db.InterviewConfig, now time.Time) bool {
	return now.After(interviewDeadline(sess, cfg).Add(abandonGrace))
}

// SubmitAbandoned submits every live session whose candidate has run out of
// both the session's time and the interview's allowance. What gets evaluated
// is the last workspace snapshot the browser sent, and whatever part of the
// interview was held. It returns how many sessions it closed.
func (o *Orchestrator) SubmitAbandoned(ctx context.Context, now time.Time) (int, error) {
	sessions, err := o.DB.ListLiveSessionsPastTime(ctx, abandonMaxAge)
	if err != nil {
		return 0, err
	}
	closed := 0
	for _, sess := range sessions {
		if !isAbandoned(sess, o.DB.GetInterviewConfig(ctx, sess.AssessmentID), now) {
			continue
		}
		overdue := int(now.Sub(sess.StartedAt.Add(time.Duration(sess.DurationMin) * time.Minute)).Minutes())
		payload, _ := json.Marshal(map[string]any{
			"reason":         "The session's time ran out and the candidate never submitted; the server submitted the work as it last stood.",
			"minutesOverdue": overdue,
		})
		if err := o.DB.InsertActivityEvents(ctx, sess.ID, []db.NewActivityEvent{{EventType: eventAutoSubmitted, Payload: payload}}); err != nil {
			slog.Error("orchestrator: recording an automatic submit failed", "session", sess.ID, "error", err)
		}
		slog.Info("orchestrator: submitting an abandoned session", "session", sess.ID, "minutesOverdue", overdue)
		// Submit is safe against the candidate's own submit arriving at the
		// same moment — only one of the two wins db.MarkSubmitted.
		if err := o.Submit(ctx, sess.ID); err != nil {
			slog.Error("orchestrator: submitting an abandoned session failed", "session", sess.ID, "error", err)
			continue
		}
		closed++
	}
	return closed, nil
}

// RunAbandonedSweep calls SubmitAbandoned every interval until ctx is done.
// It blocks; run it in its own goroutine.
func (o *Orchestrator) RunAbandonedSweep(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Evaluation makes several model calls per session, so one pass
			// gets long enough to finish a handful and no longer.
			passCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			if _, err := o.SubmitAbandoned(passCtx, time.Now()); err != nil {
				slog.Error("orchestrator: abandoned-session sweep failed", "error", err)
			}
			cancel()
		}
	}
}
