// Package httpapi is the Company Application API — the backend half of
// company/frontend's lib/db.ts, following the same "backend-first,
// Supabase-fallback" seam internal-admin/frontend already uses for its own
// ADMIN_BACKEND_URL. Handlers stay thin: parse the request, check the
// permission matrix, call the db layer, encode the result — mirrors
// candidate/backend/internal/httpapi's own shape.
package httpapi

import (
	"net/http"

	"github.com/mindfries/company-backend/internal/billing"
	"github.com/mindfries/company-backend/internal/config"
	"github.com/mindfries/company-backend/internal/db"
)

// Server holds every dependency a handler might need. Constructed once in
// cmd/server/main.go and shared across all requests — nothing here is
// per-request state.
type Server struct {
	cfg    config.Config
	db     *db.DB
	stripe *billing.Client
	plans  billing.PlanPrices
}

// New constructs the Stripe client itself (rather than taking one as a
// parameter) so it's never nil — Configured()/WebhookConfigured() report
// false on an empty secret instead of every billing handler needing its own
// nil check.
func New(cfg config.Config, database *db.DB) *Server {
	return &Server{
		cfg: cfg, db: database,
		stripe: billing.New(cfg.StripeSecretKey, cfg.StripeWebhookSecret),
		plans: billing.PlanPrices{
			Starter: cfg.StripePriceStarter, Growth: cfg.StripePriceGrowth, Enterprise: cfg.StripePriceEnterprise,
		},
	}
}

// Routes builds the full handler: middleware chain wraps a route table keyed
// by method + path pattern (Go's net/http ServeMux since 1.22 does this
// natively — no router dependency needed for a surface this size).
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

	// Candidates — any signed-in role may read; candidate:invite/
	// candidate:stage gate the mutating routes.
	mux.HandleFunc("GET /api/v1/candidates", s.requireCompany(s.handleListCandidates))
	mux.HandleFunc("GET /api/v1/candidates/compare", s.requireCompany(s.handleCompareCandidates))
	mux.HandleFunc("GET /api/v1/candidates/due-dates", s.requireCompany(s.handleListDueDates))
	mux.HandleFunc("GET /api/v1/candidates/{id}", s.requireCompany(s.handleGetCandidate))
	mux.HandleFunc("POST /api/v1/candidates/{id}/stage", s.requireAction(ActionCandidateStage, s.handleSetCandidateStage))
	mux.HandleFunc("POST /api/v1/roles/{roleId}/candidates", s.requireAction(ActionCandidateInvite, s.handleInviteCandidate))
	mux.HandleFunc("POST /api/v1/roles/{roleId}/candidates/bulk-stage", s.requireAction(ActionCandidateStage, s.handleBulkSetCandidateStage))

	// Game Library — read-only, same published-templates query every portal
	// already makes against the shared game_templates table.
	mux.HandleFunc("GET /api/v1/templates", s.requireCompany(s.handleListTemplates))

	// Team — any signed-in role may view the roster; team:manage gates
	// invite/status-change.
	mux.HandleFunc("GET /api/v1/team", s.requireCompany(s.handleListTeam))
	mux.HandleFunc("POST /api/v1/team/invite", s.requireAction(ActionTeamManage, s.handleInviteTeam))
	mux.HandleFunc("PATCH /api/v1/team/{id}", s.requireAction(ActionTeamManage, s.handlePatchTeam))

	// Billing — billing:manage gates even the read, per permissions.ts (the
	// matrix marks billing admin-only to view, not just change).
	mux.HandleFunc("GET /api/v1/billing", s.requireAction(ActionBillingManage, s.handleGetBilling))
	mux.HandleFunc("POST /api/v1/billing/checkout-session", s.requireAction(ActionBillingManage, s.handleCreateCheckoutSession))
	mux.HandleFunc("POST /api/v1/billing/portal-session", s.requireAction(ActionBillingManage, s.handleCreatePortalSession))
	// Stripe-Signature verified instead of a cookie — Stripe itself calls this.
	mux.HandleFunc("POST /api/v1/webhooks/stripe", s.handleStripeWebhook)

	return s.recoverPanic(s.logging(s.cors(mux)))
}
