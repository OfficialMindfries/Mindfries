package httpapi

import "net/http"

// handleHealth is a pure liveness check — no dependency lookups, so a load
// balancer can hit it even while the database is unreachable and still learn
// the process itself is up.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "mindfries-company-backend",
	})
}

// handleStatus reports what this instance can actually do right now: real
// database connectivity, and whether Stripe has keys configured — the same
// "say so" honesty candidate/backend's own /status already applies.
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	dbReachable := s.db.Ping(r.Context()) == nil

	writeJSON(w, http.StatusOK, map[string]any{
		"status":             "online",
		"service":            "mindfries-company-backend",
		"database_reachable": dbReachable,
		"stripe_configured":  s.cfg.StripeConfigured(),
		"webhook_configured": s.cfg.StripeWebhookSecret != "",
	})
}
