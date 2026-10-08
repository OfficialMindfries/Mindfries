// Package orchestrator is the Assessment Orchestrator and Evaluation Engine
// (PRD §1.2, §1.9): it turns "a candidate starts a template" into a real
// session row, turns a stream of activity events into evidence, and turns
// that evidence into a report by calling the AI Intelligence Layer
// (internal/llm) in the shape PRD §1.9 lays out — separate agents, combined
// by a Report agent at the end, not one giant model.
package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
	"github.com/mindfries/candidate-backend/internal/sandbox"
	"github.com/mindfries/candidate-backend/internal/ws"
)

// Orchestrator ties the data layer, the AI agents, the sandbox client and
// the real-time hub together. Every dependency is safe to hold even when
// unconfigured (sandbox and agents both report that honestly on their own);
// only DB is required.
type Orchestrator struct {
	DB      *db.DB
	Agents  *llm.Agents
	Sandbox *sandbox.Client
	Hub     *ws.Hub
	// Live is the interviewer's live voice line. Nil or unconfigured means
	// interviews are held turn by turn through Agents.
	Live *llm.LiveClient
	// SandboxNetwork and SandboxMaxLive are config.Config's settings of the
	// same names: what a sandbox may reach, and how many may run at once.
	SandboxNetwork string
	SandboxMaxLive int
}

func New(database *db.DB, agents *llm.Agents, sb *sandbox.Client, hub *ws.Hub) *Orchestrator {
	o := &Orchestrator{DB: database, Agents: agents, Sandbox: sb, Hub: hub}
	if agents != nil {
		agents.OnUsage(o.recordUsage)
	}
	return o
}

// wsEvent is the shape broadcast over a session's WebSocket room — small and
// generic on purpose, since both the candidate's own workspace and the
// admin's Global Session Monitor read the same feed for different reasons.
// The limit on assessments a candidate starts for themselves from the open
// pool: SelfStartLimit in any selfStartWindow, and never two at once.
const (
	SelfStartLimit  = 3
	selfStartWindow = 24 * time.Hour
)

// ErrSelfStartLimit and ErrSelfStartLive are returned by StartAssessment
// when a candidate has reached that limit. Their text is shown to the
// candidate as it is.
var (
	ErrSelfStartLimit = fmt.Errorf("you've started %d practice assessments in the last day — that's the limit. Invitations from companies aren't affected", SelfStartLimit)
	ErrSelfStartLive  = errors.New("you already have an assessment under way — finish or resume that one first")
)

type wsEvent struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

func (o *Orchestrator) broadcast(sessionID, eventType string, payload any) {
	if o.Hub == nil {
		return
	}
	msg, err := json.Marshal(wsEvent{Type: eventType, Payload: payload})
	if err != nil {
		return
	}
	o.Hub.Broadcast(sessionID, msg)
}

// StartAssessment resolves id against a real invitation first (the
// `assessments` table — a company-issued invite addressed to this
// candidate's email) and falls back to the open self-serve pool of
// published templates. Both are legitimate ways into an assessment today:
// there's no Company Portal yet to issue invitations at any real volume
// (see task.md's open decision on which path is primary), so the self-serve
// pool stays the practical front door while the real per-candidate path
// exists and works the moment something creates a row in it — internal-admin's
// "invite a candidate" action, or a future Company Portal.
//
// An id that happens to collide between an assessment and a template would
// be astronomically unlikely (both are random UUIDs) — trying the
// invitation first is about which case is more specific, not a race.
func (o *Orchestrator) StartAssessment(ctx context.Context, candidateID, candidateEmail, candidateName, id string) (db.Session, error) {
	if inv, err := o.DB.GetInvitation(ctx, id); err == nil {
		return o.startFromInvitation(ctx, candidateID, candidateEmail, candidateName, inv)
	}

	tmpl, err := o.DB.GetPublishedTemplate(ctx, id)
	if err != nil {
		return db.Session{}, fmt.Errorf("orchestrator: %s is not an available assessment: %w", id, err)
	}
	return o.startFromTemplate(ctx, candidateID, candidateEmail, candidateName, *tmpl)
}

func (o *Orchestrator) startFromInvitation(ctx context.Context, candidateID, candidateEmail, candidateName string, inv db.Invitation) (db.Session, error) {
	if !strings.EqualFold(inv.CandidateEmail, candidateEmail) {
		// Deliberately the same error shape as "not found" — confirming an
		// invitation id exists but belongs to someone else is exactly the
		// kind of detail an attacker probing ids shouldn't get back.
		return db.Session{}, fmt.Errorf("orchestrator: invitation not found")
	}
	if inv.Status != "invited" {
		return db.Session{}, fmt.Errorf("orchestrator: this assessment is already %s", strings.ReplaceAll(inv.Status, "_", " "))
	}

	sess, err := o.DB.StartSessionFromInvitation(ctx, candidateID, candidateName, inv)
	if err != nil {
		return db.Session{}, fmt.Errorf("orchestrator: creating session: %w", err)
	}
	if err := o.DB.SetInvitationStatus(ctx, inv.ID, "in_progress"); err != nil {
		// The session is real either way; log rather than fail a candidate's
		// entry over the invitation's own status bookkeeping.
		slog.Error("orchestrator: marking invitation in_progress failed", "invitation", inv.ID, "error", err)
	}
	// The hiring team's pipeline follows the session too (db/applications.go).
	if err := o.DB.MarkApplicationStarted(ctx, inv.ID); err != nil {
		slog.Error("orchestrator: moving the application to in_progress failed", "invitation", inv.ID, "error", err)
	}

	o.assignVariant(ctx, sess)
	sess = o.provisionAndAnnounce(ctx, sess, candidateName, candidateEmail)
	return sess, nil
}

func (o *Orchestrator) startFromTemplate(ctx context.Context, candidateID, candidateEmail, candidateName string, tmpl db.Template) (db.Session, error) {
	existing, err := o.DB.GetSessionByCandidateAndTemplate(ctx, candidateID, tmpl.ID)
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return db.Session{}, fmt.Errorf("orchestrator: checking existing session: %w", err)
	}
	if !errors.Is(err, db.ErrNotFound) {
		return db.Session{}, fmt.Errorf("orchestrator: candidate already has a session for this template (session %s)", existing.ID)
	}
	// A candidate can start open-pool assessments for themselves, and each
	// one costs real model calls to run and evaluate — so there is a ceiling
	// on how many, and only one at a time. Invitations aren't counted: a
	// company asked for those.
	started, err := o.DB.CountSelfStarted(ctx, candidateID, time.Now().Add(-selfStartWindow))
	if err != nil {
		return db.Session{}, fmt.Errorf("orchestrator: checking the self-start limit: %w", err)
	}
	if started.Live {
		return db.Session{}, ErrSelfStartLive
	}
	if started.Recent >= SelfStartLimit {
		return db.Session{}, ErrSelfStartLimit
	}

	sess, err := o.DB.StartSession(ctx, candidateID, candidateName, tmpl)
	if err != nil {
		return db.Session{}, fmt.Errorf("orchestrator: creating session: %w", err)
	}
	o.assignVariant(ctx, sess)
	sess = o.provisionAndAnnounce(ctx, sess, candidateName, candidateEmail)
	return sess, nil
}

// provisionAndAnnounce is the part both entry points share: an optional
// sandbox (never fails the session over it — "real, or an honest failure,"
// never "fail the whole flow over an optional piece that isn't wired up")
// and the real-time broadcast every session start makes.
func (o *Orchestrator) provisionAndAnnounce(ctx context.Context, sess db.Session, candidateName, candidateEmail string) db.Session {
	// The sandbox is where the candidate's workspace lives when there is one
	// (sandbox_workspace.go). A session without one — Daytona not
	// configured, or not answering — runs in the browser, as before.
	sess, _ = o.setUpSandbox(ctx, sess, candidateName, candidateEmail)
	o.broadcast(sess.ID, "session_started", sess)
	return sess
}

// TeardownSandbox is teardownSandbox's exported form, for a caller that
// doesn't already have the session loaded — today, the admin reset
// endpoint, which resets a session back to a fresh state and shouldn't
// leave whatever sandbox it had running (or its ID pointing at nothing).
func (o *Orchestrator) TeardownSandbox(ctx context.Context, sessionID string) error {
	sess, err := o.DB.GetSession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("orchestrator: loading session to tear down its sandbox: %w", err)
	}
	o.teardownSandbox(ctx, sess)
	return nil
}

// teardownSandbox deletes a session's sandbox, if it has one, and clears the
// column either way — a delete failure shouldn't leave a stale ID pointing
// at a sandbox this backend will never try to clean up again. Shared by
// Submit (a session ending normally) and the admin reset support-override
// (a session being forced back to a fresh state) — the two places a
// session's sandbox actually needs to go away. Best-effort and never
// returns an error: whoever calls this has a session-lifecycle action to
// finish, and a Daytona API hiccup shouldn't block that.
func (o *Orchestrator) teardownSandbox(ctx context.Context, sess db.Session) {
	if sess.SandboxID == nil {
		return
	}
	if o.Sandbox != nil && o.Sandbox.Configured() {
		if err := o.Sandbox.DeleteSandbox(ctx, *sess.SandboxID); err != nil {
			slog.Error("orchestrator: sandbox teardown failed", "session", sess.ID, "sandbox", *sess.SandboxID, "error", err)
		}
	}
	if err := o.DB.SetSandboxID(ctx, sess.ID, nil); err != nil {
		slog.Error("orchestrator: clearing sandbox id failed", "session", sess.ID, "error", err)
	}
}

// RecordEvents stores a batch of telemetry (PRD §1.7) and fans it out live to
// anyone watching this session's room — the admin's Global Session Monitor
// in particular.
func (o *Orchestrator) RecordEvents(ctx context.Context, sessionID string, events []db.NewActivityEvent) error {
	if err := o.DB.InsertActivityEvents(ctx, sessionID, events); err != nil {
		return err
	}
	for _, e := range events {
		o.broadcast(sessionID, "activity_event", e)
	}
	return nil
}

// Submit marks a session submitted and runs evaluation synchronously. The
// HTTP handler is the one that decides whether to wait for this or return
// immediately and let it run in the background (see httpapi's submit
// handler) — this method itself just does the work, so it's usable either
// way and independently testable.
func (o *Orchestrator) Submit(ctx context.Context, sessionID string) error {
	sess, err := o.DB.GetSession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("orchestrator: loading session to submit: %w", err)
	}

	// Conditional on the session still being "live" at write time — the
	// HTTP handler already checked this on read, but only this atomic update
	// is what actually decides between two concurrent submits (see
	// db.MarkSubmitted's own comment). Losing this race is the expected,
	// safe outcome, not an error worth logging as one.
	if err := o.DB.MarkSubmitted(ctx, sessionID); err != nil {
		if errors.Is(err, db.ErrAlreadySubmitted) {
			return nil
		}
		return err
	}
	if sess.AssessmentID != nil {
		// This session came from a real invitation — its lifecycle follows
		// the session's, the same way startFromInvitation moved it to
		// in_progress. A template-only (self-serve) session has no
		// invitation to update.
		if err := o.DB.SetInvitationStatus(ctx, *sess.AssessmentID, "submitted"); err != nil {
			slog.Error("orchestrator: marking invitation submitted failed", "invitation", *sess.AssessmentID, "error", err)
		}
		// Capped at the session's own length: a submit that arrives after
		// the clock ran out (the interview ran past it, or the server
		// submitted an abandoned session hours later) isn't time spent on
		// the task.
		took := int(math.Ceil(time.Since(sess.StartedAt).Minutes()))
		if sess.DurationMin > 0 {
			took = min(took, sess.DurationMin)
		}
		if err := o.DB.MarkApplicationCompleted(ctx, *sess.AssessmentID, took); err != nil {
			slog.Error("orchestrator: marking the application completed failed", "invitation", *sess.AssessmentID, "error", err)
		}
	}
	// The candidate is done editing the moment they submit — the sandbox
	// (if one was ever provisioned) has no further reason to exist, and
	// evaluation reads recorded telemetry, not the live sandbox.
	o.teardownSandbox(ctx, sess)

	o.broadcast(sessionID, "session_submitted", map[string]string{"sessionId": sessionID})
	return o.Evaluate(ctx, sessionID)
}
