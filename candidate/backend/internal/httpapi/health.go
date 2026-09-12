package httpapi

import "net/http"

// handleHealth is a pure liveness check — no dependency lookups, so a load
// balancer can hit it even while the database is unreachable and still learn
// the process itself is up.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "mindfries-candidate-backend",
	})
}

// handleStatus reports what this instance can actually do right now: real
// database connectivity, and whether each optional integration has a key —
// the same "say so" honesty CLAUDE.md asks of the sandbox (SchemaNotice's
// pattern in internal-admin, applied here).
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	dbReachable := s.db.Ping(r.Context()) == nil

	openrouterConfigured := s.orc.Agents != nil && s.orc.Agents.Configured()
	daytonaConfigured := s.orc.Sandbox != nil && s.orc.Sandbox.Configured()

	writeJSON(w, http.StatusOK, map[string]any{
		"status":                  "online",
		"service":                 "mindfries-candidate-backend",
		"database_reachable":      dbReachable,
		"openrouter_configured":   openrouterConfigured,
		"daytona_configured":      daytonaConfigured,
		"gemini_live_configured":  s.cfg.GeminiAPIKey != "",
		"gemini_live_implemented": false,
	})
}
