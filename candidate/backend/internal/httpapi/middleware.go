package httpapi

import (
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/mindfries/candidate-backend/internal/session"
)

// cors only ever answers with the exact origin that asked, never "*" — a
// cookie-carrying request needs Access-Control-Allow-Credentials, and browsers
// refuse to pair that with a wildcard origin anyway. An origin outside the
// allowlist gets no CORS headers at all, so the browser blocks the response
// itself rather than the server trusting an Origin header it can't verify.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(s.cfg.AllowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// logging records method, path, status and latency for every request — the
// minimum needed to read this service's behavior from its own logs rather
// than guessing.
func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", sw.status, "duration", time.Since(start))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

// recoverPanic turns a panicking handler into a 500 with a logged stack,
// instead of taking the whole process down over one bad request.
func (s *Server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("httpapi: panic recovered", "panic", rec, "path", r.URL.Path)
				writeError(w, http.StatusInternalServerError, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// requireCandidate reads the "mf_candidate" cookie candidate/frontend signs
// and refuses the request outright if it doesn't verify — the same rule
// candidate/frontend's own middleware.ts applies to page navigation, applied
// here to the API.
func (s *Server) requireCandidate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.CandidateSessionSecret == "" {
			notConfigured(w, "candidate authentication")
			return
		}
		cookie, err := r.Cookie(session.CandidateCookie)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		claims, err := session.VerifyCandidate(cookie.Value, s.cfg.CandidateSessionSecret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		next.ServeHTTP(w, withCandidate(r, claims))
	}
}

// requireAdmin is the same rule for internal-admin's "mf_admin" cookie. Any
// signed-in admin session — "admin" or "viewer" — passes this; it's the
// authentication gate, not the authorization one. Read-only admin routes
// (list sessions, watch the WS feed) stop here deliberately: a viewer is
// supposed to be able to see everything, just not change anything.
func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.AdminSessionSecret == "" {
			notConfigured(w, "admin authentication")
			return
		}
		cookie, err := r.Cookie(session.AdminCookie)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		claims, err := session.VerifyAdmin(cookie.Value, s.cfg.AdminSessionSecret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		next.ServeHTTP(w, withAdmin(r, claims))
	}
}

// requireFullAdmin is requireAdmin plus the one check that used to be
// missing entirely: every support-override endpoint (reset a session,
// re-trigger evaluation) mutates state and should never have been reachable
// by a "viewer" cookie just because it happened to verify. Composed on top
// of requireAdmin rather than duplicating the cookie check.
func (s *Server) requireFullAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		if adminFrom(r).Role != "admin" {
			writeError(w, http.StatusForbidden, "your account is view-only — ask an admin to do this")
			return
		}
		next.ServeHTTP(w, r)
	})
}
