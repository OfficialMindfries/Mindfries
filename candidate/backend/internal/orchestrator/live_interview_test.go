package orchestrator

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

// scriptedModel plays the model's side of a call from a channel, and keeps
// what it was sent.
type scriptedModel struct {
	events chan llm.LiveEvent
	closed chan struct{}
	mu     sync.Mutex
	texts  []string
}

func newScriptedModel() *scriptedModel {
	return &scriptedModel{events: make(chan llm.LiveEvent, 64), closed: make(chan struct{})}
}

func (m *scriptedModel) SendText(text string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.texts = append(m.texts, text)
	return nil
}

func (m *scriptedModel) Receive() (llm.LiveEvent, error) {
	select {
	case ev := <-m.events:
		return ev, nil
	case <-m.closed:
		return llm.LiveEvent{}, errors.New("connection closed")
	}
}

func (m *scriptedModel) sent(prefix string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, t := range m.texts {
		if strings.HasPrefix(t, prefix) {
			return true
		}
	}
	return false
}

// say queues one whole interviewer turn.
func (m *scriptedModel) say(text string) {
	m.events <- llm.LiveEvent{Audio: make([]byte, 4800), OutputText: text}
	m.events <- llm.LiveEvent{TurnComplete: true}
}

func (m *scriptedModel) hear(text string) { m.events <- llm.LiveEvent{InputText: text} }

type recordingListener struct {
	mu       sync.Mutex
	audio    int
	messages []any
}

func (l *recordingListener) Audio(pcm []byte) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.audio += len(pcm)
	return nil
}

func (l *recordingListener) Message(v any) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.messages = append(l.messages, v)
	return nil
}

func (l *recordingListener) questions() []liveQuestion {
	l.mu.Lock()
	defer l.mu.Unlock()
	var out []liveQuestion
	for _, m := range l.messages {
		if q, ok := m.(liveQuestion); ok {
			out = append(out, q)
		}
	}
	return out
}

type liveHarness struct {
	call  *liveCall
	model *scriptedModel
	out   *recordingListener
	mu    sync.Mutex
	turns []Turn
}

func newLiveHarness(cfg db.InterviewConfig, alreadyAsked int) *liveHarness {
	h := &liveHarness{model: newScriptedModel(), out: &recordingListener{}}
	h.call = &liveCall{
		sess: db.Session{ID: "s1", StartedAt: time.Now(), DurationMin: 60},
		cfg:  cfg, out: h.out, asked: alreadyAsked,
		record: func(_ context.Context, turn Turn) error {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.turns = append(h.turns, turn)
			return nil
		},
	}
	return h
}

func (h *liveHarness) transcript() []Turn {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]Turn(nil), h.turns...)
}

func (h *liveHarness) run(t *testing.T) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return h.call.run(ctx, h.model)
}

func TestLiveInterviewRecordsEachQuestionAndAnswerAndEndsOnTheSignOff(t *testing.T) {
	h := newLiveHarness(db.InterviewConfig{Questions: 2, AnswerSeconds: 120}, 0)
	m := h.model
	m.say("Why did you change the window calculation in limiter dot py?")
	m.hear("Because it used the ")
	m.hear("start time instead of now.")
	m.say("And how did you check that it worked?")
	m.hear("I wrote a test.")
	m.say("Thanks, that's the end of the interview.")

	if err := h.run(t); err != nil {
		t.Fatalf("a complete interview should end cleanly, got %v", err)
	}
	if !m.sent("[START]") {
		t.Error("the model was never told to begin")
	}
	got := h.transcript()
	want := []Turn{
		{Role: roleInterviewer, Text: "Why did you change the window calculation in limiter dot py?"},
		{Role: roleCandidate, Text: "Because it used the start time instead of now."},
		{Role: roleInterviewer, Text: "And how did you check that it worked?"},
		{Role: roleCandidate, Text: "I wrote a test."},
	}
	if len(got) != len(want) {
		t.Fatalf("transcript has %d turns, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i].Role != want[i].Role || got[i].Text != want[i].Text {
			t.Errorf("turn %d = %+v, want %+v", i, got[i], want[i])
		}
		if got[i].TimedOut {
			t.Errorf("turn %d was marked late, and nothing was", i)
		}
	}
	qs := h.out.questions()
	if len(qs) != 2 || qs[0].Asked != 1 || qs[1].Asked != 2 || qs[1].Total != 2 {
		t.Errorf("the page should be told about each question as it's put, got %+v", qs)
	}
	if h.out.audio != 3*4800 {
		t.Errorf("all of the interviewer's audio should reach the page, got %d bytes", h.out.audio)
	}
}

func TestLiveInterviewResumedCallOnlyAsksWhatIsLeft(t *testing.T) {
	h := newLiveHarness(db.InterviewConfig{Questions: 3, AnswerSeconds: 120}, 2)
	h.model.say("Last one: what would you do with more time?")
	h.model.hear("More tests.")
	h.model.say("Thank you, we're done.")

	if err := h.run(t); err != nil {
		t.Fatal(err)
	}
	got := h.transcript()
	if len(got) != 2 || got[0].Role != roleInterviewer || got[1].Text != "More tests." {
		t.Errorf("two questions were already asked, so this call has one: %+v", got)
	}
	if qs := h.out.questions(); len(qs) != 1 || qs[0].Asked != 3 {
		t.Errorf("the question should be numbered 3 of 3, got %+v", qs)
	}
}

func TestLiveInterviewKeepsAPartialAnswerWhenTheCallDrops(t *testing.T) {
	h := newLiveHarness(db.InterviewConfig{Questions: 3, AnswerSeconds: 120}, 0)
	h.model.say("Why that fix?")
	h.model.hear("Well, the original code")
	go func() {
		time.Sleep(200 * time.Millisecond)
		close(h.model.closed)
	}()

	if err := h.run(t); err == nil {
		t.Fatal("a dropped call is not a completed interview")
	}
	got := h.transcript()
	if len(got) != 2 || got[1].Role != roleCandidate || got[1].Text != "Well, the original code" {
		t.Errorf("what the candidate had said should be on the record: %+v", got)
	}
}

func TestLiveInterviewLeavesAnUnansweredQuestionWaitingWhenTheCallDrops(t *testing.T) {
	h := newLiveHarness(db.InterviewConfig{Questions: 3, AnswerSeconds: 120}, 0)
	h.model.say("Why that fix?")
	go func() {
		time.Sleep(200 * time.Millisecond)
		close(h.model.closed)
	}()

	_ = h.run(t)
	got := h.transcript()
	if len(got) != 1 || got[0].Role != roleInterviewer {
		t.Errorf("the question should stay waiting for the turn-based interview to resume, got %+v", got)
	}
}

func TestLiveInterviewMovesOnWhenTheAnswerTimeRunsOut(t *testing.T) {
	h := newLiveHarness(db.InterviewConfig{Questions: 1, AnswerSeconds: 1}, 0)
	h.model.say("Why that fix?")
	// The candidate says nothing. Once told the time is up, the model signs off.
	go func() {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if h.model.sent("[TIME]") {
				h.model.say("Thanks, that's everything.")
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	}()

	if err := h.run(t); err != nil {
		t.Fatalf("running out of time on an answer isn't a failure of the call: %v", err)
	}
	got := h.transcript()
	if len(got) != 2 || got[1].Text != noAnswerText || !got[1].TimedOut {
		t.Errorf("the question should be recorded as unanswered and late, got %+v", got)
	}
}

func TestLiveInterviewIgnoresWhatWasSaidBeforeTheQuestion(t *testing.T) {
	h := newLiveHarness(db.InterviewConfig{Questions: 1, AnswerSeconds: 120}, 0)
	h.model.hear("hello? is this on?")
	h.model.say("Why that fix?")
	h.model.hear("It was off by one.")
	h.model.say("Thank you.")

	if err := h.run(t); err != nil {
		t.Fatal(err)
	}
	got := h.transcript()
	if len(got) != 2 || got[1].Text != "It was off by one." {
		t.Errorf("only what followed the question is its answer, got %+v", got)
	}
}
