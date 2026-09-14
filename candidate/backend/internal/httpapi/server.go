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
}

func New(cfg config.Config, database *db.DB, orc *orchestrator.Orchestrator, hub *ws.Hub) *Server {
	return &Server{cfg: cfg, db: database, orc: orc, hub: hub}
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

	// Admin Portal API — every route requires the "mf_admin" cookie
	// internal-admin/frontend issues. The two mutating routes additionally
	// require the "admin" role, not just "viewer" — see requireFullAdmin.
	mux.HandleFunc("GET /api/v1/admin/sessions", s.requireAdmin(s.handleAdminListSessions))
	mux.HandleFunc("GET /api/v1/admin/sessions/{id}/ws", s.requireAdmin(s.handleAdminWS))
	mux.HandleFunc("POST /api/v1/admin/sessions/{id}/reset", s.requireFullAdmin(s.handleAdminReset))
	mux.HandleFunc("POST /api/v1/admin/sessions/{id}/retrigger-evaluation", s.requireFullAdmin(s.handleAdminRetrigger))

	return s.recoverPanic(s.logging(s.cors(mux)))
}
