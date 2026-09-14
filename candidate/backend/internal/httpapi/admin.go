package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

// adminSessionView mirrors internal-admin/frontend's Session shape
// (lib/db.ts's toSession) — the Global Session Monitor (PRD §1.11) reads
// exactly this from either the Next.js server action today or this endpoint
// once internal-admin is wired to call it.
type adminSessionView struct {
	ID            string `json:"id"`
	CandidateName string `json:"candidateName"`
	CompanyName   string `json:"companyName"`
	TemplateName  string `json:"templateName"`
	Status        string `json:"status"`
	SandboxHealth string `json:"sandboxHealth"`
	ProgressPct   int    `json:"progressPct"`
	DurationMin   int    `json:"durationMin"`
	ElapsedMin    int    `json:"elapsedMin"`
	StartedAt     string `json:"startedAt"`
}

func toAdminSessionView(r db.AdminSessionRow) adminSessionView {
	return adminSessionView{
		ID: r.ID, CandidateName: r.CandidateName, CompanyName: r.CompanyName, TemplateName: r.TemplateName,
		Status: r.Status, SandboxHealth: r.SandboxHealth, ProgressPct: r.ProgressPct,
		DurationMin: r.DurationMin, ElapsedMin: r.ElapsedMin, StartedAt: r.StartedAt.Format(time.RFC3339),
	}
}

func (s *Server) handleAdminListSessions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.ListAdminSessions(r.Context())
	if err != nil {
		slog.Error("handleAdminListSessions", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load sessions")
		return
	}
	out := make([]adminSessionView, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAdminSessionView(row))
	}
	writeJSON(w, http.StatusOK, out)
}

// handleAdminWS is the Global Session Monitor's live feed for one session —
// same room a candidate's own client subscribes to, joined here with admin
// auth instead of a candidate ownership check, since an admin is allowed to
// watch any session.
func (s *Server) handleAdminWS(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	if _, err := s.db.GetSession(r.Context(), sessionID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "session not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load session")
		}
		return
	}
	if err := s.hub.Join(w, r, sessionID); err != nil {
		slog.Error("handleAdminWS: upgrade failed", "error", err)
	}
}

type resetRequest struct {
	Status        *string `json:"status,omitempty"`
	SandboxHealth *string `json:"sandboxHealth,omitempty"`
	ProgressPct   *int    `json:"progressPct,omitempty"`
	ElapsedMin    *int    `json:"elapsedMin,omitempty"`
}

// handleAdminReset is PRD §1.11's "Reset a Candidate Session" support
// override. An empty body means a full reset to a fresh, healthy live
// session; specific fields in the body override just those (e.g. only
// clearing sandbox_health back to healthy).
func (s *Server) handleAdminReset(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")

	var body resetRequest
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "malformed request body")
			return
		}
	}

	patch := db.SessionStatePatch{Status: body.Status, SandboxHealth: body.SandboxHealth, ProgressPct: body.ProgressPct, ElapsedMin: body.ElapsedMin}
	if patch == (db.SessionStatePatch{}) {
		live, healthy, zero := "live", "healthy", 0
		patch = db.SessionStatePatch{Status: &live, SandboxHealth: &healthy, ProgressPct: &zero, ElapsedMin: &zero}
	}

	// A reset means "back to a fresh state" — whatever sandbox this session
	// had (if Daytona is configured at all) shouldn't keep running, and its
	// id shouldn't stay pointing at something this backend has stopped
	// tracking. Best-effort: a missing session here just means the patch
	// below will also no-op, and any real Daytona error is already logged
	// inside TeardownSandbox — neither should block the reset itself.
	if err := s.orc.TeardownSandbox(r.Context(), sessionID); err != nil && !errors.Is(err, db.ErrNotFound) {
		slog.Error("handleAdminReset: sandbox teardown", "error", err)
	}

	if err := s.db.UpdateSessionState(r.Context(), sessionID, patch); err != nil {
		slog.Error("handleAdminReset", "error", err)
		writeError(w, http.StatusInternalServerError, "could not reset session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"sessionId": sessionID, "status": "reset"})
}

// handleAdminRetrigger is PRD §1.11's "manually re-trigger evaluation"
// support override — re-runs the same Evaluation Engine pipeline a normal
// submit does, in the background, so a stuck or failed report can be redone
// without the candidate re-submitting anything.
func (s *Server) handleAdminRetrigger(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	if _, err := s.db.GetSession(r.Context(), sessionID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "session not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load session")
		}
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := s.orc.Evaluate(ctx, sessionID); err != nil {
			slog.Error("background re-evaluation failed", "session", sessionID, "error", err)
		}
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"sessionId": sessionID, "status": "evaluation retriggered"})
}
