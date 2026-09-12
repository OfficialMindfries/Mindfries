package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/session"
)

const testSecret = "test-secret-at-least-32-characters-long!!"

func newTestServer(candidateSecret, adminSecret string) *Server {
	return New(config.Config{CandidateSessionSecret: candidateSecret, AdminSessionSecret: adminSecret, AllowedOrigins: []string{"http://localhost:3000"}}, nil, nil, nil)
}

func TestRequireCandidateRejectsMissingCookie(t *testing.T) {
	s := newTestServer(testSecret, "")
	called := false
	h := s.requireCandidate(func(w http.ResponseWriter, r *http.Request) { called = true })

	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))

	if called {
		t.Fatal("handler should not run without a session cookie")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestRequireCandidateRejectsWhenSecretUnset(t *testing.T) {
	s := newTestServer("", "")
	h := s.requireCandidate(func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })

	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (not configured)", rec.Code)
	}
}

func TestRequireCandidateAcceptsValidCookieAndInjectsClaims(t *testing.T) {
	s := newTestServer(testSecret, "")
	token, err := session.SignCandidate(session.CandidateClaims{ID: "c1", Email: "a@b.com", Name: "A", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if err != nil {
		t.Fatalf("SignCandidate: %v", err)
	}

	var gotID string
	h := s.requireCandidate(func(w http.ResponseWriter, r *http.Request) { gotID = candidateFrom(r).ID })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: token})
	h(httptest.NewRecorder(), req)

	if gotID != "c1" {
		t.Fatalf("candidateFrom(r).ID = %q, want c1", gotID)
	}
}

func TestRequireCandidateRejectsAnAdminToken(t *testing.T) {
	// The two cookies are different trust domains signed with different
	// secrets — an admin token must not authenticate as a candidate even if
	// somehow presented under the candidate cookie name.
	s := newTestServer(testSecret, testSecret)
	adminToken, _ := session.SignAdmin(session.AdminClaims{Email: "ops@mindfries.com", Name: "Ops", Role: "admin", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)

	h := s.requireCandidate(func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: adminToken})
	rec := httptest.NewRecorder()
	h(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (admin claims lack the candidate shape's required fields)", rec.Code)
	}
}

func TestCORSOnlyReflectsAllowlistedOrigins(t *testing.T) {
	s := newTestServer(testSecret, "")
	h := s.cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))

	allowed := httptest.NewRequest(http.MethodGet, "/health", nil)
	allowed.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, allowed)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Errorf("allowed origin: Access-Control-Allow-Origin = %q", got)
	}

	blocked := httptest.NewRequest(http.MethodGet, "/health", nil)
	blocked.Header.Set("Origin", "https://evil.example")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, blocked)
	if got := rec2.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("disallowed origin should get no CORS header, got %q", got)
	}
}
