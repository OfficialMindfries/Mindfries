package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
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

type postEventsRequest struct {
	Events []struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	} `json:"events"`
}

// handlePostEvents is the Event & Telemetry Engine's ingestion point (PRD
// §1.7). candidate/frontend's workspace does not call this yet (see
// CANDIDATE_BACKEND_PLAN.md) — this is the real endpoint waiting for that
// wiring, not a placeholder that only looks real.
func (s *Server) handlePostEvents(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sessionID := r.PathValue("id")
	if _, ok := s.ownsSession(w, r, sessionID, c.ID); !ok {
		return
	}

	var body postEventsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "malformed request body")
		return
	}
	if len(body.Events) == 0 {
		writeError(w, http.StatusBadRequest, "events must be a non-empty array")
		return
	}

	events := make([]db.NewActivityEvent, 0, len(body.Events))
	for _, e := range body.Events {
		if e.Type == "" {
			writeError(w, http.StatusBadRequest, "every event needs a type")
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
	if _, ok := s.ownsSession(w, r, sessionID, c.ID); !ok {
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
