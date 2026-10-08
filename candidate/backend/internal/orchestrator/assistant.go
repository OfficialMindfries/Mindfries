package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

// The workspace assistant: what a candidate may ask it, what it is shown
// when it answers, and — afterwards — whether what it said ended up in
// their work.

const (
	eventAssistantCopy = "assistant_copy"

	// A code line shorter than this is too ordinary to attribute to anyone:
	// "return x", "}", "else:" turn up in any file.
	minOfferedLineChars = 16
	// Bounds what one reply can add to the trail.
	maxOfferedLines = 40
)

// ErrAssistantLimit is returned once a session has sent as many messages as
// its role allows (db.AssistantConfig.MaxMessages).
var ErrAssistantLimit = errors.New("orchestrator: this session has reached its assistant message limit")

// ErrAssistantOff is returned when the hiring company has switched the
// assistant off for the role.
var ErrAssistantOff = errors.New("orchestrator: the assistant is switched off for this assessment")

// AssistantState is the session's assistant conversation and what the
// candidate is still allowed to do with it.
type AssistantState struct {
	Turns []Turn
	// Enabled is false when the hiring company switched the assistant off.
	Enabled bool
	// Limit is how many messages the candidate may send; Used how many they have.
	Limit int
	Used  int
}

// AssistantHistory is the session's assistant conversation so far.
func (o *Orchestrator) AssistantHistory(ctx context.Context, sess db.Session) (AssistantState, error) {
	events, err := o.DB.GetSessionEvents(ctx, sess.ID)
	if err != nil {
		return AssistantState{}, err
	}
	cfg := o.DB.GetAssistantConfig(ctx, sess.AssessmentID)
	state := AssistantState{Turns: turnsOf(events, eventAIUsage), Enabled: cfg.Enabled, Limit: cfg.MaxMessages}
	for _, t := range state.Turns {
		if t.Role == roleCandidate {
			state.Used++
		}
	}
	return state, nil
}

// AssistantQuestion is one message to the assistant, with what the
// candidate's workspace looked like when they sent it.
type AssistantQuestion struct {
	Message string
	// FilePath and FileContent are the file open in the editor.
	FilePath    string
	FileContent string
	// Files is the whole project; Terminal the recent terminal output.
	Files    map[string]string
	Terminal string
}

// AskAssistant answers one message from the candidate and records both
// sides of the exchange as evidence. The candidate's message is recorded
// only once a reply exists — a failed model call leaves no half-exchange in
// the trail. With onDelta the reply is also delivered as it is written.
func (o *Orchestrator) AskAssistant(ctx context.Context, sess db.Session, q AssistantQuestion, onDelta func(string)) (string, error) {
	if !o.configured() {
		return "", ErrNotConfigured
	}
	ctx = llm.WithSession(ctx, sess.ID)
	cfg := o.DB.GetAssistantConfig(ctx, sess.AssessmentID)
	if !cfg.Enabled {
		return "", ErrAssistantOff
	}
	events, err := o.DB.GetSessionEvents(ctx, sess.ID)
	if err != nil {
		return "", err
	}
	if len(turnsOf(events, eventInterview)) > 0 {
		return "", ErrWorkLocked
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
	if asked >= cfg.MaxMessages {
		return "", ErrAssistantLimit
	}

	reply, err := o.Agents.Assist(ctx, llm.AssistContext{
		Brief:    briefOf(o.templateContent(ctx, sess)),
		FilePath: q.FilePath, FileContent: q.FileContent,
		Files: q.Files, Terminal: q.Terminal,
	}, chat, q.Message, onDelta)
	if err != nil {
		return "", err
	}

	// What the reply showed that the project didn't already contain — kept
	// with the reply so that, at the end, it can be checked against what was
	// submitted (see assistantUptake).
	existing := codeLineSet(q.Files)
	for line := range codeLineSet(map[string]string{q.FilePath: q.FileContent}) {
		existing[line] = true
	}
	if err := o.RecordEvents(ctx, sess.ID, []db.NewActivityEvent{
		turnEvent(eventAIUsage, Turn{Role: roleCandidate, Text: q.Message, File: q.FilePath}),
		turnEvent(eventAIUsage, Turn{Role: roleAssistant, Text: reply, Offered: offeredLines(reply, existing)}),
	}); err != nil {
		return "", err
	}
	return reply, nil
}

// normalizeCodeLine reduces a line to what makes it the same line of code:
// surrounding space dropped, runs of inner space collapsed.
func normalizeCodeLine(line string) string {
	return strings.Join(strings.Fields(line), " ")
}

// attributable reports whether a normalized line is distinctive enough that
// finding it later in the candidate's files means something.
func attributable(line string) bool {
	if len(line) < minOfferedLineChars {
		return false
	}
	letters := 0
	for _, r := range line {
		if unicode.IsLetter(r) {
			letters++
		}
	}
	if letters < 6 {
		return false
	}
	// A comment is prose, and prose matching isn't "used the code".
	return !strings.HasPrefix(line, "#") && !strings.HasPrefix(line, "//") && !strings.HasPrefix(line, "*") && !strings.HasPrefix(line, "/*")
}

// codeLineSet is every attributable line across a set of files.
func codeLineSet(files map[string]string) map[string]bool {
	set := map[string]bool{}
	for _, content := range files {
		for _, line := range strings.Split(content, "\n") {
			if n := normalizeCodeLine(line); attributable(n) {
				set[n] = true
			}
		}
	}
	return set
}

// offeredLines picks out the code a reply showed — the lines inside its
// fenced blocks — leaving out anything already in the candidate's project
// (the assistant quoting their own code back isn't offering them anything).
func offeredLines(reply string, existing map[string]bool) []string {
	var out []string
	seen := map[string]bool{}
	inFence := false
	for _, line := range strings.Split(reply, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			inFence = !inFence
			continue
		}
		if !inFence {
			continue
		}
		n := normalizeCodeLine(line)
		if !attributable(n) || existing[n] || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
		if len(out) == maxOfferedLines {
			break
		}
	}
	return out
}

// assistantUptake reports how the candidate used the assistant and whether
// code it showed them is in what they submitted. It reads the record and
// compares text; no model is involved, so it says only what can be checked:
// a line the assistant gave that now appears word for word in their files.
// An idea taken from a reply and written in the candidate's own words is not
// something this can see, and it doesn't claim to.
//
// Empty when the candidate never used the assistant.
func assistantUptake(events []db.ActivityEvent) string {
	var asked, copies int
	var offered []string
	var latest *snapshotPayload
	for _, e := range events {
		switch e.EventType {
		case eventAssistantCopy:
			copies++
		case eventSnapshot:
			var snap snapshotPayload
			if json.Unmarshal(e.Payload, &snap) == nil {
				latest = &snap
			}
		case eventAIUsage:
			var t Turn
			if json.Unmarshal(e.Payload, &t) != nil {
				continue
			}
			if t.Role == roleCandidate {
				asked++
			}
			offered = append(offered, t.Offered...)
		}
	}
	if asked == 0 {
		return ""
	}

	var b strings.Builder
	fmt.Fprintf(&b, "The candidate sent the assistant %s.", plural(asked, "message"))
	switch {
	case len(offered) == 0:
		b.WriteString(" None of its replies contained code that wasn't already in their project.")
	case latest == nil:
		fmt.Fprintf(&b, " Its replies showed %s of code new to their project; no copy of the submitted work was recorded to check them against.", plural(len(offered), "line"))
	default:
		// Where each offered line turned up, if anywhere.
		where := map[string][]string{}
		used := 0
		for _, line := range dedupe(offered) {
			for path, content := range latest.Files {
				if codeLineSet(map[string]string{path: content})[line] {
					where[path] = append(where[path], line)
					used++
					break
				}
			}
		}
		total := len(dedupe(offered))
		if used == 0 {
			fmt.Fprintf(&b, " Its replies showed %s of code new to their project; none of them appear in the submitted work.", plural(total, "line"))
		} else {
			verb := "appear"
			if used == 1 {
				verb = "appears"
			}
			fmt.Fprintf(&b, " Its replies showed %s of code new to their project; %d of them %s word for word in the submitted work:", plural(total, "line"), used, verb)
			paths := make([]string, 0, len(where))
			for p := range where {
				paths = append(paths, p)
			}
			sort.Strings(paths)
			for _, p := range paths {
				for _, line := range where[p] {
					b.WriteString("\n- " + p + ": " + line)
				}
			}
		}
	}
	if copies > 0 {
		fmt.Fprintf(&b, "\nThey copied text out of the assistant panel %s.", plural(copies, "time"))
	}
	return b.String()
}

func plural(n int, noun string) string {
	if n == 1 {
		return "1 " + noun
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
