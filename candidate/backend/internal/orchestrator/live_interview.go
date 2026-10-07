package orchestrator

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

// The follow-up interview as one live voice call (internal/llm/live.go),
// instead of question-by-question requests.
//
// It is the same interview as the turn-based one in interview.go, kept in the
// same place: every question and answer is an "interview" event in the
// session's trail, written here from the transcript the model sends back. So
// the report, the hiring team's transcript and the time limits all work
// unchanged — and a call that drops halfway is picked up by the turn-based
// interview from exactly where the transcript stops.

const (
	// liveStallTimeout is how long the interviewer may stay silent when it
	// is its turn to speak before the call is given up on.
	liveStallTimeout = 30 * time.Second

	// liveOutputBytesPerSecond is 16-bit mono PCM at llm.LiveOutputRate.
	liveOutputBytesPerSecond = llm.LiveOutputRate * 2

	// untranscribedText stands in for speech the service gave no text for.
	untranscribedText = "(spoken, but it could not be transcribed)"
)

// ErrLiveStalled means the model stopped responding mid-interview.
var ErrLiveStalled = errors.New("orchestrator: the live interviewer stopped responding")

// LiveModel is the model's end of the call — *llm.LiveSession in production.
type LiveModel interface {
	SendText(text string) error
	Receive() (llm.LiveEvent, error)
}

// LiveListener is the candidate's end: their browser, over a WebSocket.
type LiveListener interface {
	// Audio plays a chunk of the interviewer's voice.
	Audio(pcm []byte) error
	// Message sends a small JSON status message — see the live* types below.
	Message(v any) error
}

// Messages to the candidate's browser.
type (
	liveCaption struct {
		Type string `json:"type"` // "caption"
		Role string `json:"role"`
		Text string `json:"text"`
	}
	liveQuestion struct {
		Type          string `json:"type"` // "question"
		Asked         int    `json:"asked"`
		Total         int    `json:"total"`
		AnswerSeconds int    `json:"answerSeconds"`
		// StartsInMs is how much of the question is still to be heard: the
		// model finishes generating speech before the browser finishes
		// playing it, and the answer clock starts when it has been heard.
		StartsInMs int `json:"startsInMs"`
	}
	liveSignal struct {
		Type string `json:"type"` // "interrupted" | "time_up"
	}
)

// LiveInterviewPlan is everything decided before the call is placed.
type LiveInterviewPlan struct {
	Config db.InterviewConfig
	// Prompt is the system prompt the model is connected with.
	Prompt string
	// Asked is how many questions were already put before this call — more
	// than zero when it resumes an interview begun earlier.
	Asked int
	// Done means there is nothing left to ask and no call should be placed.
	Done bool
}

// PlanLiveInterview works out where the session's interview stands and
// writes the model's instructions for the rest of it. A question left
// waiting by an earlier, dropped call is recorded as unanswered: the
// candidate heard it and the call ended, and a new call starts on a new
// question rather than re-asking by voice something already on the record.
func (o *Orchestrator) PlanLiveInterview(ctx context.Context, sess db.Session) (LiveInterviewPlan, error) {
	cfg := o.DB.GetInterviewConfig(ctx, sess.AssessmentID)
	events, err := o.DB.GetSessionEvents(ctx, sess.ID)
	if err != nil {
		return LiveInterviewPlan{}, err
	}
	transcript := turnsOf(events, eventInterview)
	if n := len(transcript); n > 0 && transcript[n-1].Role == roleInterviewer {
		turn := Turn{Role: roleCandidate, Text: noAnswerText, TimedOut: true}
		if err := o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{turnEvent(eventInterview, turn)}); err != nil {
			return LiveInterviewPlan{}, err
		}
		transcript = append(transcript, turn)
	}

	plan := LiveInterviewPlan{Config: cfg}
	chat := make([]llm.ChatMessage, 0, len(transcript))
	for _, t := range transcript {
		role := "user"
		if t.Role == roleInterviewer {
			role = "assistant"
			plan.Asked++
		}
		chat = append(chat, llm.ChatMessage{Role: role, Content: t.Text})
	}
	if plan.Asked >= cfg.Questions || time.Now().After(interviewDeadline(sess, cfg)) {
		plan.Done = true
		return plan, nil
	}

	tc := o.templateContent(ctx, sess)
	work, trail := digestEvents(events, tc.StarterFiles)
	guidance := ""
	if tc.InterviewerPrompt != nil {
		guidance = *tc.InterviewerPrompt
	}
	plan.Prompt = llm.LiveInterviewPrompt(llm.InterviewContext{
		Brief: briefOf(tc), Guidance: guidance,
		Work: clipMiddle(work, maxWorkChars), Trail: clipMiddle(trail, maxInterviewTrailChars),
		Tone: cfg.Tone, Language: db.InterviewLanguages[cfg.Language],
	}, cfg.Questions, cfg.AnswerSeconds, chat)
	return plan, nil
}

// liveCall is the state of one call.
type liveCall struct {
	// record writes one turn of the interview to the session's trail.
	record func(ctx context.Context, turn Turn) error
	sess   db.Session
	cfg    db.InterviewConfig
	out    LiveListener
	asked  int

	question strings.Builder // the interviewer's turn so far
	answer   strings.Builder // the candidate's answer so far

	// The interviewer's current turn: when its audio began, and how much.
	turnStart time.Time
	turnAudio int

	// awaiting: a question has been put and its answer not yet recorded.
	awaiting bool
	// askedAt is when the candidate had heard the question in full.
	askedAt time.Time
	// answeredAt is set when the interviewer starts speaking again — the
	// answer ended then, though its last words of transcript may still be
	// on their way, so it is recorded when the interviewer's turn completes.
	answeredAt time.Time
	// nudged: the answer's time ran out and the interviewer was told to move on.
	nudged bool

	promptTokens, responseTokens int
}

// RunLiveInterview conducts the interview over an open call until every
// question has been asked and answered, the session's time for it runs out,
// or the call fails. It returns nil when the interview is complete; any
// error means it is not, and the turn-based interview can take over.
//
// It does not close model or out — the caller that opened them does.
func (o *Orchestrator) RunLiveInterview(ctx context.Context, sess db.Session, plan LiveInterviewPlan, modelName string, model LiveModel, out LiveListener) error {
	c := &liveCall{sess: sess, cfg: plan.Config, out: out, asked: plan.Asked}
	c.record = func(ctx context.Context, turn Turn) error {
		return o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{turnEvent(eventInterview, turn)})
	}
	defer func() {
		if c.promptTokens+c.responseTokens > 0 {
			// The Live API reports tokens, not a charge, so this records
			// volume only; its cost has to be read off Google's own billing.
			o.recordUsage(ctx, llm.Usage{Agent: "interviewer_live", SessionID: sess.ID, Model: modelName,
				PromptTokens: c.promptTokens, CompletionTokens: c.responseTokens})
		}
	}()

	return c.run(ctx, model)
}

// run is the call's loop: the model's events, the answer clock, and the
// caller's context, whichever comes first.
func (c *liveCall) run(ctx context.Context, model LiveModel) error {
	out := c.out
	type received struct {
		ev  llm.LiveEvent
		err error
	}
	incoming := make(chan received)
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			ev, err := model.Receive()
			select {
			case incoming <- received{ev, err}:
			case <-stop:
				return
			}
			if err != nil {
				return
			}
		}
	}()

	if err := model.SendText("[START] Begin the interview now."); err != nil {
		return err
	}
	timer := time.NewTimer(liveStallTimeout)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			c.closeAnswer(time.Now())
			return ctx.Err()

		case <-timer.C:
			now := time.Now()
			if !c.awaiting || c.nudged || !c.answeredAt.IsZero() {
				// It was the interviewer's turn and nothing came.
				c.closeAnswer(now)
				return ErrLiveStalled
			}
			// The answer's time is up. The interviewer is told to move on;
			// what the candidate has said so far stands as their answer.
			c.nudged = true
			_ = out.Message(liveSignal{Type: "time_up"})
			if err := model.SendText("[TIME] The time for this answer has passed. Without remarking on it, continue."); err != nil {
				c.closeAnswer(now)
				return err
			}
			timer.Reset(liveStallTimeout)

		case r := <-incoming:
			if r.err != nil {
				c.closeAnswer(time.Now())
				return r.err
			}
			done, wait, err := c.handle(ctx, r.ev, time.Now())
			if err != nil {
				return err
			}
			if done {
				return nil
			}
			if wait > 0 {
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(wait)
			}
			if r.ev.GoAway {
				c.closeAnswer(time.Now())
				return errors.New("orchestrator: the live service ended the call")
			}
		}
	}
}

// handle applies one event from the model. done means the interview is
// complete; wait, when positive, is how long to allow before the timer in
// RunLiveInterview should next fire.
func (c *liveCall) handle(ctx context.Context, ev llm.LiveEvent, now time.Time) (done bool, wait time.Duration, err error) {
	c.promptTokens += ev.PromptTokens
	c.responseTokens += ev.ResponseTokens

	if ev.InputText != "" {
		c.answer.WriteString(ev.InputText)
		_ = c.out.Message(liveCaption{Type: "caption", Role: roleCandidate, Text: ev.InputText})
	}

	speaking := len(ev.Audio) > 0 || ev.OutputText != ""
	if speaking {
		if c.turnAudio == 0 && c.question.Len() == 0 {
			// The interviewer has started a new turn, so the candidate's
			// answer — if one was being waited for — ended here.
			c.turnStart = now
			if c.awaiting && c.answeredAt.IsZero() {
				c.answeredAt = now
			}
			wait = liveStallTimeout
		}
		if len(ev.Audio) > 0 {
			c.turnAudio += len(ev.Audio)
			if err := c.out.Audio(ev.Audio); err != nil {
				c.closeAnswer(now)
				return false, 0, err
			}
		}
		if ev.OutputText != "" {
			c.question.WriteString(ev.OutputText)
			_ = c.out.Message(liveCaption{Type: "caption", Role: roleInterviewer, Text: ev.OutputText})
		}
	}

	if ev.Interrupted {
		_ = c.out.Message(liveSignal{Type: "interrupted"})
	}
	if !ev.TurnComplete {
		return false, wait, nil
	}

	// The interviewer has finished a turn.
	text := strings.Join(strings.Fields(c.question.String()), " ")
	audio := c.turnAudio
	c.question.Reset()
	c.turnAudio = 0
	if text == "" && audio == 0 {
		return false, wait, nil // an empty turn — nothing was said
	}
	if err := c.closeAnswer(now); err != nil {
		return false, 0, err
	}
	if c.asked >= c.cfg.Questions {
		// Every question has been asked, so this was the sign-off.
		return true, 0, nil
	}
	if now.After(interviewDeadline(c.sess, c.cfg)) {
		// Out of time with questions still to go: the interview closes with
		// what it has, the same way the turn-based one does.
		return true, 0, nil
	}
	if text == "" {
		text = untranscribedText
	}
	if err := c.record(ctx, Turn{Role: roleInterviewer, Text: text}); err != nil {
		return false, 0, err
	}
	c.asked++
	c.awaiting, c.nudged, c.answeredAt = true, false, time.Time{}
	// Anything picked up before the question existed isn't an answer to it.
	c.answer.Reset()

	// Speech is generated faster than it is spoken; the candidate's clock
	// starts when they have actually heard the question.
	heard := c.turnStart.Add(time.Duration(audio) * time.Second / liveOutputBytesPerSecond)
	c.askedAt = now
	if heard.After(now) {
		c.askedAt = heard
	}
	_ = c.out.Message(liveQuestion{
		Type: "question", Asked: c.asked, Total: c.cfg.Questions, AnswerSeconds: c.cfg.AnswerSeconds,
		StartsInMs: int(c.askedAt.Sub(now).Milliseconds()),
	})
	return false, c.askedAt.Sub(now) + time.Duration(c.cfg.AnswerSeconds)*time.Second, nil
}

// closeAnswer records the answer to the waiting question, if there is one.
// It is called when the interviewer's next turn completes, and on every way
// out of the call, so a question never stays on the record without the
// answer that was given to it.
func (c *liveCall) closeAnswer(now time.Time) error {
	if !c.awaiting {
		return nil
	}
	c.awaiting = false
	text := strings.Join(strings.Fields(c.answer.String()), " ")
	c.answer.Reset()
	if text == "" && !c.nudged && c.answeredAt.IsZero() {
		// The call is ending with the question unanswered and time still on
		// its clock. It stays waiting, and the turn-based interview resumes
		// on it.
		return nil
	}
	ended := c.answeredAt
	if ended.IsZero() {
		ended = now
	}
	took := max(0, int(ended.Sub(c.askedAt).Seconds()))

	turn := Turn{Role: roleCandidate, Text: text, Seconds: took, TimedOut: c.nudged || took > c.cfg.AnswerSeconds+answerGraceSeconds}
	if text == "" {
		if c.nudged {
			turn.Text, turn.TimedOut = noAnswerText, true
		} else {
			turn.Text = untranscribedText
		}
	}
	// Not the call's context: this is also the way out when that context is
	// already cancelled, and the answer still has to be kept.
	writeCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return c.record(writeCtx, turn)
}
