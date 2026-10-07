package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

// The follow-up interview (PRD §1.6: workspace → interview → submit) as a
// small state machine over the session's own event trail. Nothing about an
// interview lives anywhere else: each question and answer is an "interview"
// activity event, and where the interview stands is always recomputed from
// those — which is what lets a reload resume it, and what makes the server,
// not the browser, the judge of how long an answer took.

const (
	// answerGraceSeconds is the slack between the limit the candidate sees
	// and the point an answer is marked late: the countdown runs in the
	// browser, and the answer still has to travel here.
	answerGraceSeconds = 15

	// perQuestionOverhead is added to each answer limit when working out how
	// long a whole interview may run past the session clock: time for the
	// question to be generated and read out.
	perQuestionOverhead = 45 * time.Second

	// noAnswerText stands in for an answer that was never given, so the
	// transcript shows the question was put and went unanswered.
	noAnswerText = "(no answer given in the time allowed)"
)

// ErrNoQuestionWaiting is returned when an interview answer arrives with no
// question outstanding.
var ErrNoQuestionWaiting = errors.New("orchestrator: there is no interview question waiting for an answer")

// InterviewState is where a session's follow-up interview stands.
type InterviewState struct {
	// Question is the one waiting for an answer. Empty when Done.
	Question string `json:"question,omitempty"`
	Done     bool   `json:"done"`
	// Asked counts questions put so far, including the one waiting.
	Asked int `json:"asked"`
	Total int `json:"total"`
	// Language is the BCP-47 tag the interview is held in — the browser
	// reads questions aloud and listens in it.
	Language string `json:"language"`
	// AnswerSeconds is the limit per answer; SecondsLeft is what remains of
	// it for the waiting question, measured here from when it was asked, so
	// reloading the page doesn't reset the clock.
	AnswerSeconds int `json:"answerSeconds"`
	SecondsLeft   int `json:"secondsLeft,omitempty"`
	// CutShort is set with Done when the interview ended because the session
	// ran out of time rather than because every question was answered.
	CutShort bool `json:"cutShort,omitempty"`
}

// InterviewAnswer is what the candidate sends back for the waiting question.
type InterviewAnswer struct {
	Text string
	// Skipped means the time ran out with nothing to send. It is recorded as
	// an unanswered question, distinct from an empty Text, which only asks
	// where the interview stands.
	Skipped bool
}

// interviewDeadline is the latest an interview may still be asking
// questions: the end of the session's own time, plus room for one whole
// interview. A candidate who clicks Submit in the last minute still gets
// their interview; one who never finishes it doesn't hold the session open
// for ever.
func interviewDeadline(sess db.Session, cfg db.InterviewConfig) time.Time {
	budget := time.Duration(cfg.Questions) * (time.Duration(cfg.AnswerSeconds)*time.Second + perQuestionOverhead)
	return sess.StartedAt.Add(time.Duration(sess.DurationMin)*time.Minute + budget)
}

// InterviewNext advances the follow-up interview by one step. With an
// answer (or a skip), it records it against the question that was waiting,
// along with how long it took; then it returns the next question, or Done
// once every question has been answered. Calling it with neither while a
// question is waiting returns that same question — a reload resumes the
// interview rather than restarting or skipping ahead.
func (o *Orchestrator) InterviewNext(ctx context.Context, sess db.Session, answer InterviewAnswer) (InterviewState, error) {
	if !o.configured() {
		return InterviewState{}, ErrNotConfigured
	}
	ctx = llm.WithSession(ctx, sess.ID)
	cfg := o.DB.GetInterviewConfig(ctx, sess.AssessmentID)
	events, err := o.DB.GetSessionEvents(ctx, sess.ID)
	if err != nil {
		return InterviewState{}, err
	}
	now := time.Now()
	return o.interviewStep(ctx, sess, cfg, events, answer, now)
}

// interviewStep is InterviewNext with its inputs already loaded and the
// clock passed in, which keeps the state machine itself free of the
// database for everything except recording a turn.
func (o *Orchestrator) interviewStep(ctx context.Context, sess db.Session, cfg db.InterviewConfig, events []db.ActivityEvent, answer InterviewAnswer, now time.Time) (InterviewState, error) {
	transcript := turnsOf(events, eventInterview)
	state := InterviewState{Total: cfg.Questions, Language: cfg.Language, AnswerSeconds: cfg.AnswerSeconds}

	var askedAt time.Time
	for _, e := range events {
		if e.EventType == eventInterview {
			askedAt = e.OccurredAt // ends as the latest interview event's time
		}
	}
	for _, t := range transcript {
		if t.Role == roleInterviewer {
			state.Asked++
		}
	}
	waiting := len(transcript) > 0 && transcript[len(transcript)-1].Role == roleInterviewer

	text := strings.TrimSpace(answer.Text)
	answering := text != "" || answer.Skipped
	switch {
	case answering && !waiting:
		return InterviewState{}, ErrNoQuestionWaiting
	case answering:
		took := int(now.Sub(askedAt).Seconds())
		turn := Turn{Role: roleCandidate, Text: text, Seconds: took, TimedOut: took > cfg.AnswerSeconds+answerGraceSeconds}
		if text == "" {
			turn.Text, turn.TimedOut = noAnswerText, true
		}
		if err := o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{turnEvent(eventInterview, turn)}); err != nil {
			return InterviewState{}, err
		}
		transcript = append(transcript, turn)
	case waiting:
		state.Question = transcript[len(transcript)-1].Text
		state.SecondsLeft = max(0, cfg.AnswerSeconds-int(now.Sub(askedAt).Seconds()))
		return state, nil
	}

	if state.Asked >= cfg.Questions {
		state.Done = true
		return state, nil
	}
	if now.After(interviewDeadline(sess, cfg)) {
		// Out of time with questions still to ask. The interview closes with
		// what it has; the transcript is shorter, and says so.
		state.Done, state.CutShort = true, true
		return state, nil
	}

	tc := o.templateContent(ctx, sess)
	work, trail := digestEvents(events, tc.StarterFiles)
	work, trail = clipMiddle(work, maxWorkChars), clipMiddle(trail, maxInterviewTrailChars)
	chat := make([]llm.ChatMessage, 0, len(transcript))
	for _, t := range transcript {
		role := "user"
		if t.Role == roleInterviewer {
			role = "assistant"
		}
		chat = append(chat, llm.ChatMessage{Role: role, Content: t.Text})
	}
	guidance := ""
	if tc.InterviewerPrompt != nil {
		guidance = *tc.InterviewerPrompt
	}

	question, err := o.Agents.InterviewTurn(ctx, llm.InterviewContext{
		Brief: briefOf(tc), Guidance: guidance, Work: work, Trail: trail,
		Tone: cfg.Tone, Language: db.InterviewLanguages[cfg.Language],
	}, chat, state.Asked+1, cfg.Questions)
	if err != nil {
		return InterviewState{}, err
	}
	if question == "" {
		return InterviewState{}, errors.New("orchestrator: the interviewer returned an empty question")
	}
	if err := o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{
		turnEvent(eventInterview, Turn{Role: roleInterviewer, Text: question}),
	}); err != nil {
		return InterviewState{}, err
	}
	state.Question = question
	state.Asked++
	state.SecondsLeft = cfg.AnswerSeconds
	return state, nil
}

// formatTranscript writes a conversation out for an analysis agent. For
// interview answers it includes how long each took and whether it ran over,
// since hesitation and a missed answer are evidence too.
func formatTranscript(turns []Turn) string {
	var b strings.Builder
	for _, t := range turns {
		who := "Candidate"
		switch t.Role {
		case roleInterviewer:
			who = "Interviewer"
		case roleAssistant:
			who = "Assistant"
		}
		b.WriteString(who + ": " + t.Text)
		switch {
		case t.TimedOut && t.Text == noAnswerText:
			// the text already says it
		case t.TimedOut:
			fmt.Fprintf(&b, " [answered in %ds, over the time limit]", t.Seconds)
		case t.Seconds > 0:
			fmt.Fprintf(&b, " [answered in %ds]", t.Seconds)
		}
		b.WriteString("\n")
	}
	return b.String()
}
