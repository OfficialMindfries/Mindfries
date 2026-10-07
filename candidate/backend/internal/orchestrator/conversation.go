package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

// Everything a candidate says to an AI, and everything it says back, is
// stored as ordinary activity_events — the same evidence trail file saves
// and git commands already go into (PRD §1.7 counts AI usage as an evidence
// dimension). No separate conversation table: the trail is the record, and
// the assistant's own history is rebuilt from it on every turn.
const (
	eventAIUsage   = "ai_usage"
	eventInterview = "interview"
	eventSnapshot  = "workspace_snapshot"

	roleCandidate   = "candidate"
	roleAssistant   = "assistant"
	roleInterviewer = "interviewer"

	// InterviewQuestions is how many follow-up questions the interviewer asks.
	InterviewQuestions = 4
	// MaxAssistantTurns bounds one session's assistant use — a ceiling on
	// model spend per candidate, well above what a real session needs.
	MaxAssistantTurns = 60

	maxSnapshotBytes = 300 * 1024
	maxSnapshotFile  = 60 * 1024
	maxTrailPayload  = 600
)

// ErrNotConfigured means no model can be called — surfaced as-is so the
// HTTP layer can say so instead of inventing a reply.
var ErrNotConfigured = llm.ErrNotConfigured

// ErrAssistantLimit is returned once a session has used MaxAssistantTurns.
var ErrAssistantLimit = errors.New("orchestrator: this session has reached its assistant message limit")

// ErrNoQuestionWaiting is returned when an interview answer arrives with no
// question outstanding.
var ErrNoQuestionWaiting = errors.New("orchestrator: there is no interview question waiting for an answer")

// Turn is one side of a recorded conversation.
type Turn struct {
	Role string `json:"role"`
	Text string `json:"text"`
	// File is the path the candidate had open when they asked — assistant
	// turns only, and only for the record.
	File string `json:"file,omitempty"`
}

func turnsOf(events []db.ActivityEvent, eventType string) []Turn {
	var out []Turn
	for _, e := range events {
		if e.EventType != eventType {
			continue
		}
		var t Turn
		if json.Unmarshal(e.Payload, &t) == nil && t.Text != "" {
			out = append(out, t)
		}
	}
	return out
}

func turnEvent(eventType string, t Turn) db.NewActivityEvent {
	payload, _ := json.Marshal(t)
	return db.NewActivityEvent{EventType: eventType, Payload: payload}
}

func (o *Orchestrator) configured() bool { return o.Agents != nil && o.Agents.Configured() }

// templateContent is the brief and starter files behind a session, or empty
// values when it has no template or the lookup fails — the agents work with
// less context rather than not at all.
func (o *Orchestrator) templateContent(ctx context.Context, sess db.Session) db.TemplateContent {
	if sess.TemplateID == nil {
		return db.TemplateContent{}
	}
	tc, err := o.DB.GetTemplateContent(ctx, *sess.TemplateID)
	if err != nil {
		return db.TemplateContent{}
	}
	return tc
}

func briefOf(tc db.TemplateContent) string {
	if tc.TaskBrief == nil {
		return ""
	}
	return *tc.TaskBrief
}

// AssistantHistory is the session's assistant conversation so far.
func (o *Orchestrator) AssistantHistory(ctx context.Context, sessionID string) ([]Turn, error) {
	events, err := o.DB.GetSessionEvents(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	return turnsOf(events, eventAIUsage), nil
}

// AskAssistant answers one message from the candidate and records both
// sides of the exchange as evidence. The candidate's message is recorded
// only once a reply exists — a failed model call leaves no half-exchange in
// the trail.
func (o *Orchestrator) AskAssistant(ctx context.Context, sess db.Session, message, filePath, fileContent string) (string, error) {
	if !o.configured() {
		return "", ErrNotConfigured
	}
	events, err := o.DB.GetSessionEvents(ctx, sess.ID)
	if err != nil {
		return "", err
	}
	history := turnsOf(events, eventAIUsage)
	asked := 0
	chat := make([]llm.ChatMessage, 0, len(history))
	for _, t := range history {
		role := "assistant"
		if t.Role == roleCandidate {
			role = "user"
			asked++
		}
		chat = append(chat, llm.ChatMessage{Role: role, Content: t.Text})
	}
	if asked >= MaxAssistantTurns {
		return "", ErrAssistantLimit
	}

	reply, err := o.Agents.Assist(ctx, briefOf(o.templateContent(ctx, sess)), filePath, fileContent, chat, message)
	if err != nil {
		return "", err
	}

	if err := o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{
		turnEvent(eventAIUsage, Turn{Role: roleCandidate, Text: message, File: filePath}),
		turnEvent(eventAIUsage, Turn{Role: roleAssistant, Text: reply}),
	}); err != nil {
		return "", err
	}
	return reply, nil
}

// InterviewState is where a session's follow-up interview stands.
type InterviewState struct {
	// Question is the one waiting for an answer. Empty when Done.
	Question string `json:"question,omitempty"`
	Done     bool   `json:"done"`
	// Asked counts questions put so far, including the one waiting.
	Asked int `json:"asked"`
	Total int `json:"total"`
}

// InterviewNext advances the follow-up interview by one step. With an
// answer, it records it against the question that was waiting; then it
// returns the next question, or Done once InterviewQuestions have been
// answered. Calling it with no answer while a question is waiting returns
// that same question — a reload resumes the interview rather than
// restarting or skipping ahead.
func (o *Orchestrator) InterviewNext(ctx context.Context, sess db.Session, answer string) (InterviewState, error) {
	if !o.configured() {
		return InterviewState{}, ErrNotConfigured
	}
	events, err := o.DB.GetSessionEvents(ctx, sess.ID)
	if err != nil {
		return InterviewState{}, err
	}
	transcript := turnsOf(events, eventInterview)

	asked := 0
	for _, t := range transcript {
		if t.Role == roleInterviewer {
			asked++
		}
	}
	waiting := len(transcript) > 0 && transcript[len(transcript)-1].Role == roleInterviewer

	answer = strings.TrimSpace(answer)
	switch {
	case answer != "" && !waiting:
		return InterviewState{}, ErrNoQuestionWaiting
	case answer != "":
		t := Turn{Role: roleCandidate, Text: answer}
		if err := o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{turnEvent(eventInterview, t)}); err != nil {
			return InterviewState{}, err
		}
		transcript = append(transcript, t)
	case waiting:
		return InterviewState{Question: transcript[len(transcript)-1].Text, Asked: asked, Total: InterviewQuestions}, nil
	}

	if asked >= InterviewQuestions {
		return InterviewState{Done: true, Asked: asked, Total: InterviewQuestions}, nil
	}

	tc := o.templateContent(ctx, sess)
	work, trail := digestEvents(events, tc.StarterFiles)
	chat := make([]llm.ChatMessage, 0, len(transcript))
	for _, t := range transcript {
		role := "user"
		if t.Role == roleInterviewer {
			role = "assistant"
		}
		chat = append(chat, llm.ChatMessage{Role: role, Content: t.Text})
	}

	question, err := o.Agents.InterviewTurn(ctx, briefOf(tc), work, trail, chat, asked+1, InterviewQuestions)
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
	return InterviewState{Question: question, Asked: asked + 1, Total: InterviewQuestions}, nil
}

type snapshotPayload struct {
	Files map[string]string `json:"files"`
	// Skipped lists paths left out for size, so the record says what it
	// doesn't contain rather than silently looking complete.
	Skipped []string `json:"skipped,omitempty"`
}

// RecordSnapshot stores the candidate's workspace files as evidence — what
// the interviewer and the Code Evaluation agent actually read. Dependency
// and VCS directories are dropped, and anything past the size limits is
// listed as skipped instead of stored.
func (o *Orchestrator) RecordSnapshot(ctx context.Context, sessionID string, files map[string]string) error {
	if len(files) == 0 {
		return nil
	}
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	snap := snapshotPayload{Files: map[string]string{}}
	total := 0
	for _, p := range paths {
		clean := strings.TrimPrefix(p, "/")
		if strings.HasPrefix(clean, "node_modules/") || strings.Contains(clean, "/node_modules/") || strings.HasPrefix(clean, ".git/") {
			continue
		}
		content := files[p]
		if len(content) > maxSnapshotFile || total+len(content) > maxSnapshotBytes {
			snap.Skipped = append(snap.Skipped, p)
			continue
		}
		snap.Files[p] = content
		total += len(content)
	}
	payload, err := json.Marshal(snap)
	if err != nil {
		return err
	}
	// Straight to the database, not through RecordEvents: a whole codebase
	// has no business being fanned out over the session's live WebSocket room.
	return o.DB.InsertActivityEvents(ctx, sessionID, []db.NewActivityEvent{{EventType: eventSnapshot, Payload: payload}})
}

// describeWork compares the latest workspace snapshot against the files the
// candidate started with and writes out what changed — new and modified
// files in full, deletions by name. Empty when no snapshot was ever taken.
func describeWork(snapshot *snapshotPayload, starter map[string]string) string {
	if snapshot == nil {
		return ""
	}
	norm := func(p string) string { return strings.TrimPrefix(p, "/") }
	base := make(map[string]string, len(starter))
	for p, c := range starter {
		base[norm(p)] = c
	}

	paths := make([]string, 0, len(snapshot.Files))
	seen := map[string]bool{}
	for p := range snapshot.Files {
		paths = append(paths, p)
		seen[norm(p)] = true
	}
	sort.Strings(paths)

	var b strings.Builder
	changed := 0
	for _, p := range paths {
		content := snapshot.Files[p]
		original, existed := base[norm(p)]
		switch {
		case !existed:
			fmt.Fprintf(&b, "=== %s (new file)\n%s\n\n", norm(p), content)
		case original != content:
			fmt.Fprintf(&b, "=== %s (modified)\n--- as given\n%s\n--- as submitted\n%s\n\n", norm(p), original, content)
		default:
			continue
		}
		changed++
	}

	var deleted []string
	for p := range base {
		if !seen[p] {
			deleted = append(deleted, p)
		}
	}
	sort.Strings(deleted)
	skipped := map[string]bool{}
	for _, p := range snapshot.Skipped {
		skipped[norm(p)] = true
	}
	for _, p := range deleted {
		if skipped[p] {
			continue
		}
		fmt.Fprintf(&b, "=== %s (deleted)\n\n", p)
		changed++
	}

	if changed == 0 {
		b.WriteString("The candidate made no changes to the files they were given.\n")
	}
	if len(snapshot.Skipped) > 0 {
		fmt.Fprintf(&b, "Not included here because of size: %s\n", strings.Join(snapshot.Skipped, ", "))
	}
	return b.String()
}

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
		b.WriteString(who + ": " + t.Text + "\n")
	}
	return b.String()
}
