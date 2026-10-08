package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

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

	maxSnapshotBytes = 300 * 1024
	maxSnapshotFile  = 60 * 1024
	maxTrailPayload  = 600
)

// ErrNotConfigured means no model can be called — surfaced as-is so the
// HTTP layer can say so instead of inventing a reply.
var ErrNotConfigured = llm.ErrNotConfigured

// ErrWorkLocked is returned for anything that belongs to working on the
// task — asking the assistant, most obviously — once the interview has
// begun. See RecordSnapshot for why the interview is the point of no return.
var ErrWorkLocked = errors.New("orchestrator: the interview has started, so work on the task is closed")

// Turn is one side of a recorded conversation.
type Turn struct {
	Role string `json:"role"`
	Text string `json:"text"`
	// File is the path the candidate had open when they asked — assistant
	// turns only, and only for the record.
	File string `json:"file,omitempty"`
	// Seconds is how long the candidate took to answer an interview
	// question, measured on the server from when it was asked.
	Seconds int `json:"seconds,omitempty"`
	// TimedOut marks an interview answer that ran past its time limit, or
	// that was never given.
	TimedOut bool `json:"timedOut,omitempty"`
	// Offered is, on an assistant reply, the lines of code it showed that
	// were not already in the candidate's project — see assistantUptake.
	Offered []string `json:"offered,omitempty"`
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

// templateContent is TemplateContent under the name the rest of this
// package has always called it by.
func (o *Orchestrator) templateContent(ctx context.Context, sess db.Session) db.TemplateContent {
	return o.TemplateContent(ctx, sess)
}

func briefOf(tc db.TemplateContent) string {
	if tc.TaskBrief == nil {
		return ""
	}
	return *tc.TaskBrief
}

type snapshotPayload struct {
	Files map[string]string `json:"files"`
	// Skipped lists paths left out for size, so the record says what it
	// doesn't contain rather than silently looking complete.
	Skipped []string `json:"skipped,omitempty"`
	// Checkpoint marks a snapshot the workspace saved by itself while the
	// candidate was working, as opposed to one taken at a step they took
	// (asking the interviewer in, submitting). Only the latest is kept.
	Checkpoint bool `json:"checkpoint,omitempty"`
}

// checkpointFlag is the payload key db.ReplaceFlaggedEvent matches on.
const checkpointFlag = "checkpoint"

// RecordCheckpoint saves the workspace as it stands while the candidate is
// still working. Nothing reads it unless the session is never submitted from
// the browser — a closed tab, a dead battery — in which case it is the work
// the server submits (see abandoned.go). Each one replaces the last.
func (o *Orchestrator) RecordCheckpoint(ctx context.Context, sessionID string, files map[string]string) error {
	return o.recordSnapshot(ctx, sessionID, files, true)
}

// RecordSnapshot stores the candidate's workspace files as evidence — what
// the interviewer and the Code Evaluation agent actually read. Dependency
// and VCS directories are dropped, and anything past the size limits is
// listed as skipped instead of stored.
//
// The first question of the interview freezes the work. The interviewer
// talks about the candidate's code in specifics — in a live run it named
// the very calculation an unfinished submission had left broken — so a
// snapshot arriving after that point could be the candidate's work plus
// what the interview just told them. Those are ignored: what gets evaluated
// is the code as it stood when the interview began.
func (o *Orchestrator) RecordSnapshot(ctx context.Context, sessionID string, files map[string]string) error {
	return o.recordSnapshot(ctx, sessionID, files, false)
}

func (o *Orchestrator) recordSnapshot(ctx context.Context, sessionID string, files map[string]string, checkpoint bool) error {
	if len(files) == 0 {
		return nil
	}
	if started, err := o.DB.HasEvent(ctx, sessionID, eventInterview); err != nil {
		return err
	} else if started {
		return nil
	}
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	snap := snapshotPayload{Files: map[string]string{}, Checkpoint: checkpoint}
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
	if checkpoint {
		return o.DB.ReplaceFlaggedEvent(ctx, sessionID, checkpointFlag, db.NewActivityEvent{EventType: eventSnapshot, Payload: payload})
	}
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

// SavedWorkspace is the candidate's work as the server last had it.
type SavedWorkspace struct {
	Files map[string]string `json:"files"`
	// SavedAt is when that copy was taken.
	SavedAt time.Time `json:"savedAt"`
	// Frozen means the interview has begun: the work can be read but no
	// longer changed (see RecordSnapshot).
	Frozen bool `json:"frozen"`
}

// Workspace returns the latest copy of a session's files the server holds —
// a checkpoint taken while the candidate worked, or the snapshot from a step
// they took. It is what lets a session be picked up again in another
// browser, or after this one's storage was cleared. Nil when nothing has
// been saved yet: the session then starts from the task's own files.
func (o *Orchestrator) Workspace(ctx context.Context, sessionID string) (*SavedWorkspace, error) {
	e, err := o.DB.LatestEvent(ctx, sessionID, eventSnapshot)
	if err != nil || e == nil {
		return nil, err
	}
	var snap snapshotPayload
	if err := json.Unmarshal(e.Payload, &snap); err != nil || len(snap.Files) == 0 {
		return nil, nil
	}
	frozen, err := o.DB.HasEvent(ctx, sessionID, eventInterview)
	if err != nil {
		return nil, err
	}
	return &SavedWorkspace{Files: snap.Files, SavedAt: e.OccurredAt, Frozen: frozen}, nil
}
