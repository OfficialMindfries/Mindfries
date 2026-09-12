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
	"fmt"
	"log/slog"
	"strings"

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
}

func New(database *db.DB, agents *llm.Agents, sb *sandbox.Client, hub *ws.Hub) *Orchestrator {
	return &Orchestrator{DB: database, Agents: agents, Sandbox: sb, Hub: hub}
}

// wsEvent is the shape broadcast over a session's WebSocket room — small and
// generic on purpose, since both the candidate's own workspace and the
// admin's Global Session Monitor read the same feed for different reasons.
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

// StartAssessment validates the template is real and published, creates the
// session row attributed to the signed-in candidate, and — if Daytona is
// configured — provisions a sandbox for it. A sandbox failure doesn't fail
// the session start: the candidate still has a real session row and the
// session's sandbox_health reflects the honest state, per this repo's
// "real, or an honest failure" rule (never fail the whole flow over an
// optional piece that isn't wired up).
func (o *Orchestrator) StartAssessment(ctx context.Context, candidateID, candidateName, templateID string) (db.Session, error) {
	tmpl, err := o.DB.GetPublishedTemplate(ctx, templateID)
	if err != nil {
		return db.Session{}, fmt.Errorf("orchestrator: template %s is not available: %w", templateID, err)
	}

	sess, err := o.DB.StartSession(ctx, candidateID, candidateName, *tmpl)
	if err != nil {
		return db.Session{}, fmt.Errorf("orchestrator: creating session: %w", err)
	}

	if o.Sandbox != nil && o.Sandbox.Configured() {
		if _, err := o.Sandbox.CreateSandbox(ctx, sandbox.CreateOptions{}); err != nil {
			slog.Error("orchestrator: sandbox provisioning failed", "session", sess.ID, "error", err)
			degraded := "degraded"
			_ = o.DB.UpdateSessionState(ctx, sess.ID, db.SessionStatePatch{SandboxHealth: &degraded})
			sess.SandboxHealth = degraded
		}
	}

	o.broadcast(sess.ID, "session_started", sess)
	return sess, nil
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
	submitted := "submitted"
	if err := o.DB.UpdateSessionState(ctx, sessionID, db.SessionStatePatch{Status: &submitted}); err != nil {
		return err
	}
	o.broadcast(sessionID, "session_submitted", map[string]string{"sessionId": sessionID})
	return o.Evaluate(ctx, sessionID)
}

// Evaluate runs the Code Evaluation, Reasoning and Workflow agents over a
// session's recorded evidence, then the Report agent over their combined
// output, and stores the result. If the agent layer isn't configured
// (no OPENROUTER_API_KEY), the report is saved as "failed" with that exact
// reason — never a fabricated recommendation.
func (o *Orchestrator) Evaluate(ctx context.Context, sessionID string) error {
	report, err := o.DB.CreatePendingReport(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("orchestrator: creating report row: %w", err)
	}
	if err := o.DB.SetReportGenerating(ctx, report.ID); err != nil {
		return err
	}
	o.broadcast(sessionID, "report_generating", map[string]string{"sessionId": sessionID, "reportId": report.ID})

	if o.Agents == nil || !o.Agents.Configured() {
		reason := "OpenRouter is not configured (OPENROUTER_API_KEY unset) — no model was called"
		_ = o.DB.SaveReportFailure(ctx, report.ID, reason)
		o.broadcast(sessionID, "report_failed", map[string]string{"sessionId": sessionID, "reason": reason})
		return fmt.Errorf("orchestrator: %s", reason)
	}

	events, err := o.DB.GetSessionEvents(ctx, sessionID)
	if err != nil {
		_ = o.DB.SaveReportFailure(ctx, report.ID, err.Error())
		return err
	}
	diff, digest := digestEvents(events)

	var evidence []db.EvidenceItem
	var forReport []string

	if out, err := o.Agents.EvaluateCode(ctx, diff); err == nil {
		evidence = append(evidence, db.EvidenceItem{Category: "code_evaluation", Observation: out})
		forReport = append(forReport, "Code Evaluation:\n"+out)
	} else {
		slog.Warn("orchestrator: code evaluation skipped", "session", sessionID, "error", err)
	}

	if out, err := o.Agents.AnalyzeReasoning(ctx, digest); err == nil {
		evidence = append(evidence, db.EvidenceItem{Category: "reasoning", Observation: out})
		forReport = append(forReport, "Reasoning:\n"+out)
	} else {
		slog.Warn("orchestrator: reasoning analysis skipped", "session", sessionID, "error", err)
	}

	if out, err := o.Agents.AnalyzeWorkflow(ctx, digest); err == nil {
		evidence = append(evidence, db.EvidenceItem{Category: "workflow", Observation: out})
		forReport = append(forReport, "Workflow:\n"+out)
	} else {
		slog.Warn("orchestrator: workflow analysis skipped", "session", sessionID, "error", err)
	}

	if len(forReport) == 0 {
		reason := "no agent produced usable evidence for this session (see server logs for each agent's error)"
		_ = o.DB.SaveReportFailure(ctx, report.ID, reason)
		o.broadcast(sessionID, "report_failed", map[string]string{"sessionId": sessionID, "reason": reason})
		return fmt.Errorf("orchestrator: %s", reason)
	}

	result, err := o.Agents.GenerateReport(ctx, forReport)
	if err != nil {
		_ = o.DB.SaveReportFailure(ctx, report.ID, err.Error())
		o.broadcast(sessionID, "report_failed", map[string]string{"sessionId": sessionID, "reason": err.Error()})
		return err
	}

	if err := o.DB.SaveReportResult(ctx, report.ID, result.Recommendation, result.Summary, evidence); err != nil {
		return err
	}
	o.broadcast(sessionID, "report_ready", map[string]string{"sessionId": sessionID, "reportId": report.ID})
	return nil
}

// digestEvents turns a session's raw activity_events into (a) a best-effort
// unified diff built from "git" events, for the Code Evaluation agent, and
// (b) a plain chronological text trail for the Reasoning and Workflow
// agents. Today's IDE (candidate/frontend/src/app/ide) does not yet post
// events to this backend at all (see CANDIDATE_BACKEND_PLAN.md's telemetry
// gap) — until that's wired up, this will usually see an empty slice, and
// both agents will honestly report "no evidence" rather than a fabricated
// read on a session they were never shown.
func digestEvents(events []db.ActivityEvent) (diff string, digest string) {
	var diffLines []string
	var trail []string
	for _, e := range events {
		trail = append(trail, fmt.Sprintf("[%s] %s: %s", e.OccurredAt.Format("15:04:05"), e.EventType, string(e.Payload)))
		if e.EventType == "git" {
			var p struct {
				Diff string `json:"diff"`
			}
			if json.Unmarshal(e.Payload, &p) == nil && p.Diff != "" {
				diffLines = append(diffLines, p.Diff)
			}
		}
	}
	return strings.Join(diffLines, "\n\n"), strings.Join(trail, "\n")
}
