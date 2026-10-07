// Package httpapi is the Application API and Admin Portal API (PRD §2.3 —
// both live in the same Go monolith as Section 2.3's "Assessment / Game
// Library... lives inside the monolith" already says for the authoring
// tools). Handlers stay thin: parse the request, check ownership, call the
// orchestrator or db layer, encode the result — the actual work lives in
// internal/orchestrator and internal/db so it's usable (and testable)
// without an HTTP request wrapped around it.
package httpapi

import (
	"net/http"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/orchestrator"
	"github.com/mindfries/candidate-backend/internal/verify"
	"github.com/mindfries/candidate-backend/internal/ws"
)

// Server holds every dependency a handler might need. Constructed once in
// cmd/server/main.go and shared across all requests — nothing here is
// per-request state.
type Server struct {
	cfg config.Config
	db  *db.DB
	orc *orchestrator.Orchestrator
	hub *ws.Hub
	// verifier runs a generated task before its author saves it. Nil when
	// there is nowhere to run one — see verify.FromEnv.
	verifier verify.Runner
}

func New(cfg config.Config, database *db.DB, orc *orchestrator.Orchestrator, hub *ws.Hub) *Server {
	s := &Server{cfg: cfg, db: database, orc: orc, hub: hub}
	if orc != nil {
		s.verifier = verify.FromEnv(orc.Sandbox)
	}
	return s
}

// Routes builds the full handler: middleware chain wraps a route table keyed
// by method + path pattern (Go's net/http ServeMux since 1.22 does this
// natively — no router dependency needed for a surface this size).
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /status", s.handleStatus)

	// Candidate-facing Application API — every route requires the
	// "mf_candidate" cookie candidate/frontend already issues.
	mux.HandleFunc("GET /api/v1/me", s.requireCandidate(s.handleMe))
	mux.HandleFunc("GET /api/v1/assessments", s.requireCandidate(s.handleListAssessments))
	mux.HandleFunc("POST /api/v1/assessments/{id}/sessions", s.requireCandidate(s.handleStartSession))
	mux.HandleFunc("GET /api/v1/sessions/{id}", s.requireCandidate(s.handleGetSession))
	mux.HandleFunc("GET /api/v1/sessions/{id}/assessment", s.requireCandidate(s.handleGetSessionAssessment))
	mux.HandleFunc("POST /api/v1/sessions/{id}/events", s.requireCandidate(s.handlePostEvents))
	mux.HandleFunc("POST /api/v1/sessions/{id}/submit", s.requireCandidate(s.handleSubmit))
	mux.HandleFunc("GET /api/v1/sessions/{id}/report", s.requireCandidate(s.handleGetReport))
	mux.HandleFunc("GET /api/v1/sessions/{id}/ws", s.requireCandidate(s.handleCandidateWS))
	// The workspace assistant and the follow-up interview (conversation.go).
	mux.HandleFunc("GET /api/v1/sessions/{id}/assistant", s.requireCandidate(s.handleAssistantHistory))
	mux.HandleFunc("POST /api/v1/sessions/{id}/assistant", s.requireCandidate(s.handleAssistantAsk))
	mux.HandleFunc("POST /api/v1/sessions/{id}/assistant/stream", s.requireCandidate(s.handleAssistantStream))
	mux.HandleFunc("POST /api/v1/sessions/{id}/interview", s.requireCandidate(s.handleInterview))
	mux.HandleFunc("POST /api/v1/sessions/{id}/checkpoint", s.requireCandidate(s.handleCheckpoint))
	mux.HandleFunc("GET /api/v1/sessions/{id}/workspace", s.requireCandidate(s.handleGetWorkspace))
	// The live voice interview (live.go): a ticket from the first, spent on the second.
	mux.HandleFunc("POST /api/v1/sessions/{id}/interview/live", s.requireCandidate(s.handleLiveInterviewStart))
	mux.HandleFunc("GET /api/v1/live-interview", s.handleLiveInterviewCall)

	// Admin Portal API — every route requires the "mf_admin" cookie
	// internal-admin/frontend issues. The mutating routes additionally
	// require the "admin" role, not just "viewer" — see requireFullAdmin.
	mux.HandleFunc("GET /api/v1/admin/sessions", s.requireAdmin(s.handleAdminListSessions))
	mux.HandleFunc("GET /api/v1/admin/sessions/{id}/ws", s.requireAdmin(s.handleAdminWS))
	mux.HandleFunc("POST /api/v1/admin/sessions/{id}/reset", s.requireFullAdmin(s.handleAdminReset))
	mux.HandleFunc("POST /api/v1/admin/sessions/{id}/retrigger-evaluation", s.requireFullAdmin(s.handleAdminRetrigger))
	mux.HandleFunc("POST /api/v1/admin/templates/generate", s.requireFullAdmin(s.handleAdminGenerateTask))

	// Company Portal — the "mf_company" cookie company/frontend issues.
	mux.HandleFunc("POST /api/v1/company/templates/generate", s.requireCompanyWriter(s.handleCompanyGenerateTask))

	return s.recoverPanic(s.logging(s.cors(mux)))
}
