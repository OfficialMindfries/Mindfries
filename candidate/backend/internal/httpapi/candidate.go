package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

// handleMe returns the signed-in candidate's identity as the session cookie
// carries it — nothing queried, since the cookie is already the source of
// truth for who this is.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	writeJSON(w, http.StatusOK, map[string]string{"id": c.ID, "email": c.Email, "name": c.Name})
}

// assessmentView is the same shape candidate/frontend's listAvailableAssessments
// (src/lib/db.ts) used to produce from game_templates alone — now also fed
// by real per-candidate invitations (the `assessments` table), so any
// client gets one consistent mapping regardless of which of the two this
// item actually is. `id` works as the path parameter for starting a session
// either way — the orchestrator resolves it against an invitation first,
// then the open pool (see orchestrator.StartAssessment).
type assessmentView struct {
	ID       string   `json:"id"`
	Role     string   `json:"role"`
	Company  string   `json:"company"`
	Location string   `json:"location"`
	Tags     []string `json:"tags"`
	Status   string   `json:"status"`
	Due      string   `json:"due"`
	Match    *int     `json:"match,omitempty"`
}

func techStackTags(stack []string, durationMin int) []string {
	tags := []string{}
	for i, ts := range stack {
		if i >= 2 {
			break
		}
		tags = append(tags, ts)
	}
	return append(tags, fmt.Sprintf("%d min", durationMin))
}

// invitationStatus maps assessments.status (underscore, matching the SQL
// enum-by-convention already used across this schema) to the candidate
// frontend's AssessmentStatus union (hyphenated — lib/dashboard/data.ts).
// The two were never going to naturally agree; this is the one place that
// difference is bridged rather than leaking into either side.
func invitationStatus(dbStatus string) string {
	if dbStatus == "in_progress" {
		return "in-progress"
	}
	return dbStatus // invited|submitted|closed already match
}

func toAssessmentView(t db.Template) assessmentView {
	return assessmentView{
		ID: t.ID, Role: t.Name, Company: "Mindfries", Location: "Remote",
		Tags: techStackTags(t.TechStack, t.DurationMin), Status: "invited", Due: "Open now",
	}
}

func toInvitationView(inv db.Invitation) assessmentView {
	role := inv.TemplateName
	if inv.Role != nil && *inv.Role != "" {
		role = *inv.Role
	}
	due := "No due date set"
	if inv.DueDate != nil && *inv.DueDate != "" {
		due = "Due " + *inv.DueDate
	}
	return assessmentView{
		ID: inv.ID, Role: role, Company: inv.CompanyName, Location: "Remote",
		Tags: techStackTags(inv.TechStack, inv.DurationMin), Status: invitationStatus(inv.Status),
		Due: due, Match: inv.MatchScore,
	}
}

// handleListAssessments returns a candidate's real invitations (companies →
// this candidate specifically, via `assessments.candidate_email`) followed
// by the open self-serve pool of published templates anyone can start —
// see orchestrator.StartAssessment's doc comment for why both coexist.
func (s *Server) handleListAssessments(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)

	invitations, err := s.db.ListInvitationsForCandidate(r.Context(), c.Email)
	if err != nil {
		slog.Error("handleListAssessments: invitations", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load assessments")
		return
	}
	templates, err := s.db.ListPublishedTemplates(r.Context())
	if err != nil {
		slog.Error("handleListAssessments: templates", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load assessments")
		return
	}

	out := make([]assessmentView, 0, len(invitations)+len(templates))
	for _, inv := range invitations {
		out = append(out, toInvitationView(inv))
	}
	for _, t := range templates {
		out = append(out, toAssessmentView(t))
	}
	writeJSON(w, http.StatusOK, out)
}

// handleStartSession is the Assessment Orchestrator's entry point: a
// signed-in candidate starts either a real invitation or an open template —
// the orchestrator itself resolves which.
func (s *Server) handleStartSession(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	id := r.PathValue("id")

	sess, err := s.orc.StartAssessment(r.Context(), c.ID, c.Email, c.Name, id)
	if err != nil {
		slog.Error("handleStartSession", "error", err)
		writeError(w, http.StatusBadRequest, "could not start that assessment: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, sessionView(sess))
}

type sessionResponse struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	SandboxHealth string `json:"sandboxHealth"`
	ProgressPct   int    `json:"progressPct"`
	DurationMin   int    `json:"durationMin"`
	ElapsedMin    int    `json:"elapsedMin"`
	StartedAt     string `json:"startedAt"`
}

func sessionView(s db.Session) sessionResponse {
	return sessionResponse{
		ID: s.ID, Status: s.Status, SandboxHealth: s.SandboxHealth,
		ProgressPct: s.ProgressPct, DurationMin: s.DurationMin, ElapsedMin: s.ElapsedMin,
		StartedAt: s.StartedAt.Format(time.RFC3339),
	}
}

// ownsSession loads a session and confirms it belongs to the requesting
// candidate. Sessions started before candidate_id existed (or by anything
// else) have no owner and are refused the same as someone else's — there is
// no legitimate reason a candidate-authenticated request should reach a
// session without a candidate_id match.
func (s *Server) ownsSession(w http.ResponseWriter, r *http.Request, sessionID, candidateID string) (db.Session, bool) {
	sess, err := s.db.GetSession(r.Context(), sessionID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "session not found")
		return db.Session{}, false
	}
	if err != nil {
		slog.Error("ownsSession", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load session")
		return db.Session{}, false
	}
	if sess.CandidateID == nil || *sess.CandidateID != candidateID {
		writeError(w, http.StatusNotFound, "session not found")
		return db.Session{}, false
	}
	return sess, true
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, sessionView(sess))
}

type sessionAssessmentResponse struct {
	TaskBrief    *string           `json:"taskBrief,omitempty"`
	StarterFiles map[string]string `json:"starterFiles,omitempty"`
}

// handleGetSessionAssessment is what makes the IDE's task brief and
// starting files real instead of MOCK_TASK_MARKDOWN and an empty VFS
// (task.md's gap #1, and "Sandbox, codebases, and session integrity" #1) —
// fetched once when the IDE mounts for this session, not polled, since
// starter files can be real file content and there's no reason to resend
// it on every status check the way sessionView's fields are.
//
// A session with no template (shouldn't happen in practice — every session
// is created from one) or a template authored before 0010's columns
// existed both resolve to an empty response rather than an error: the IDE
// falls back to its own honest "no real brief yet" state either way.
func (s *Server) handleGetSessionAssessment(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	if sess.TemplateID == nil {
		writeJSON(w, http.StatusOK, sessionAssessmentResponse{})
		return
	}

	content, err := s.db.GetTemplateContent(r.Context(), *sess.TemplateID)
	if err != nil {
		slog.Error("handleGetSessionAssessment", "session", sess.ID, "template", *sess.TemplateID, "error", err)
		writeError(w, http.StatusInternalServerError, "could not load assessment content")
		return
	}
	writeJSON(w, http.StatusOK, sessionAssessmentResponse{TaskBrief: content.TaskBrief, StarterFiles: content.StarterFiles})
}

type postEventsRequest struct {
	Events []struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	} `json:"events"`
}

// Telemetry ingestion limits. None of this existed before: an authenticated
// candidate session could push an unbounded body, an unbounded number of
// events per request, and an event_type of any shape at all into
// activity_events — a storage-exhaustion / memory-pressure vector, not just
// a hypothetical one, since nothing here is CORS-protected against a
// non-browser client holding a stolen session cookie. The real client caps
// itself at 25 events per batch (lib/ide/telemetry.ts's MAX_BATCH) — these
// are server-side limits with real headroom above that, not a mirror of it,
// since the server is the actual trust boundary.
const (
	maxEventsPerRequest      = 100
	maxRequestBodyBytes      = 512 * 1024 // 512KB — generous for 100 small JSON events, not for an attempted dump
	maxEventTypePayloadBytes = 16 * 1024  // per event; activity_events.payload is jsonb, not unbounded text
)

// eventTypePattern is deliberately a shape check, not the closed enum
// activity_events' own schema comment documents (navigation|file_edit|git|
// terminal|test_run|ai_usage) — the real client already sends
// "workspace_output", outside that list, and more types are a stated,
// expected follow-up (raw terminal capture, once that's decided). A closed
// enum here would need updating every time telemetry scope grows and would
// currently reject real, already-flowing events; a shape check still stops
// garbage/oversized/control-character event types without needing to know
// the full list in advance.
var eventTypePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// sessionIsLive is the one gate between "still being worked on" and
// "finished" — everything past `live` (submitted, evaluating, completed,
// failed) is a session no further candidate action should touch. `stuck` is
// deliberately excluded: it's an admin support-override target
// (SessionStatePatch), not a state a candidate action ever produces or
// should be able to write around.
func sessionIsLive(status string) bool {
	return status == "live"
}

// handlePostEvents is the Event & Telemetry Engine's ingestion point (PRD
// §1.7), real and in real use — candidate/frontend's workspace batches
// git/npm/pip activity, preview rebuilds, and file saves here via
// lib/ide/telemetry.ts, through the same-origin /api/telemetry relay.
func (s *Server) handlePostEvents(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sessionID := r.PathValue("id")
	sess, ok := s.ownsSession(w, r, sessionID, c.ID)
	if !ok {
		return
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+") — new activity can't be recorded")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var body postEventsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}
		writeError(w, http.StatusBadRequest, "malformed request body")
		return
	}
	if len(body.Events) == 0 {
		writeError(w, http.StatusBadRequest, "events must be a non-empty array")
		return
	}
	if len(body.Events) > maxEventsPerRequest {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("too many events in one request (max %d)", maxEventsPerRequest))
		return
	}

	events := make([]db.NewActivityEvent, 0, len(body.Events))
	for _, e := range body.Events {
		if e.Type == "" || !eventTypePattern.MatchString(e.Type) {
			writeError(w, http.StatusBadRequest, "event type must be lowercase letters, digits and underscores, starting with a letter, 64 characters or fewer")
			return
		}
		if len(e.Payload) > maxEventTypePayloadBytes {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("event payload too large for type %q (max %d bytes)", e.Type, maxEventTypePayloadBytes))
			return
		}
		events = append(events, db.NewActivityEvent{EventType: e.Type, Payload: e.Payload})
	}

	if err := s.orc.RecordEvents(r.Context(), sessionID, events); err != nil {
		slog.Error("handlePostEvents", "error", err)
		writeError(w, http.StatusInternalServerError, "could not record events")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]int{"recorded": len(events)})
}

// handleSubmit ends the session and runs evaluation in the background — the
// agent calls in internal/orchestrator can take well over the time a
// candidate should wait on this request, so the client is expected to poll
// GET .../report instead of blocking on this call.
func (s *Server) handleSubmit(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sessionID := r.PathValue("id")
	sess, ok := s.ownsSession(w, r, sessionID, c.ID)
	if !ok {
		return
	}
	if !sessionIsLive(sess.Status) {
		// Already submitted (or further along) — refuse rather than let a
		// second submit silently re-run evaluation and overwrite whatever
		// report already came out of the first one. See task.md's "Sandbox,
		// codebases, and session integrity" for why this mattered.
		writeError(w, http.StatusConflict, "this session has already been submitted")
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := s.orc.Submit(ctx, sessionID); err != nil {
			slog.Error("background evaluation failed", "session", sessionID, "error", err)
		}
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"sessionId": sessionID, "status": "submitted"})
}

type reportResponse struct {
	Status         string             `json:"status"`
	Recommendation *string            `json:"recommendation,omitempty"`
	Summary        *string            `json:"summary,omitempty"`
	Error          *string            `json:"error,omitempty"`
	Evidence       []evidenceItemView `json:"evidence,omitempty"`
}

type evidenceItemView struct {
	Category    string `json:"category"`
	Observation string `json:"observation"`
}

func (s *Server) handleGetReport(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sessionID := r.PathValue("id")
	if _, ok := s.ownsSession(w, r, sessionID, c.ID); !ok {
		return
	}

	report, err := s.db.GetReportBySession(r.Context(), sessionID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no report has been requested for this session yet — submit it first")
		return
	}
	if err != nil {
		slog.Error("handleGetReport", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load report")
		return
	}

	resp := reportResponse{Status: report.Status, Recommendation: report.Recommendation, Summary: report.Summary, Error: report.Error}
	if report.Status == "ready" {
		items, err := s.db.GetEvidenceItems(r.Context(), report.ID)
		if err != nil {
			slog.Error("handleGetReport: evidence", "error", err)
			writeError(w, http.StatusInternalServerError, "could not load evidence")
			return
		}
		for _, it := range items {
			resp.Evidence = append(resp.Evidence, evidenceItemView{Category: it.Category, Observation: it.Observation})
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleCandidateWS subscribes the candidate's own client to their session's
// real-time room — live status, and (once the sandbox side exists) terminal
// output.
func (s *Server) handleCandidateWS(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sessionID := r.PathValue("id")
	if _, ok := s.ownsSession(w, r, sessionID, c.ID); !ok {
		return
	}
	if err := s.hub.Join(w, r, sessionID); err != nil {
		slog.Error("handleCandidateWS: upgrade failed", "error", err)
	}
}
