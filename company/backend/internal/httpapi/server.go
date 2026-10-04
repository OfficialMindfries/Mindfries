// Package httpapi is the Company Application API — the backend half of
// company/frontend's lib/db.ts, following the same "backend-first,
// Supabase-fallback" seam internal-admin/frontend already uses for its own
// ADMIN_BACKEND_URL. Handlers stay thin: parse the request, check the
// permission matrix, call the db layer, encode the result — mirrors
// candidate/backend/internal/httpapi's own shape.
package httpapi

import (
	"net/http"

	"github.com/mindfries/company-backend/internal/config"
	"github.com/mindfries/company-backend/internal/db"
)

// Server holds every dependency a handler might need. Constructed once in
// cmd/server/main.go and shared across all requests — nothing here is
// per-request state.
type Server struct {
	cfg config.Config
	db  *db.DB
}

func New(cfg config.Config, database *db.DB) *Server {
	return &Server{cfg: cfg, db: database}
}

// Routes builds the full handler: middleware chain wraps a route table keyed
// by method + path pattern (Go's net/http ServeMux since 1.22 does this
// natively — no router dependency needed for a surface this size). Phases
// 3-4 add team and billing routes to this table as each lands.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /status", s.handleStatus)

	// Roles — any signed-in role may read; role:write gates the one mutating
	// route, matching company/frontend/lib/auth/permissions.ts's matrix.
	mux.HandleFunc("GET /api/v1/roles", s.requireCompany(s.handleListRoles))
	mux.HandleFunc("POST /api/v1/roles", s.requireAction(ActionRoleWrite, s.handleCreateRole))
	mux.HandleFunc("GET /api/v1/roles/{id}", s.requireCompany(s.handleGetRole))
	mux.HandleFunc("PATCH /api/v1/roles/{id}", s.requireAction(ActionRoleWrite, s.handlePatchRole))

	// Candidates — any signed-in role may read; candidate:stage gates the
	// one mutating route.
	mux.HandleFunc("GET /api/v1/candidates", s.requireCompany(s.handleListCandidates))
	mux.HandleFunc("GET /api/v1/candidates/compare", s.requireCompany(s.handleCompareCandidates))
	mux.HandleFunc("GET /api/v1/candidates/{id}", s.requireCompany(s.handleGetCandidate))
	mux.HandleFunc("POST /api/v1/candidates/{id}/stage", s.requireAction(ActionCandidateStage, s.handleSetCandidateStage))

	return s.recoverPanic(s.logging(s.cors(mux)))
}
