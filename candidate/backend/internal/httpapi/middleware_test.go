package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/session"
)

const testSecret = "test-secret-at-least-32-characters-long!!"

func newTestServer(candidateSecret, adminSecret string) *Server {
	s := New(config.Config{CandidateSessionSecret: candidateSecret, AdminSessionSecret: adminSecret, AllowedOrigins: []string{"http://localhost:3000"}}, nil, nil, nil)
	// requireCandidate asks the store whether the account still stands.
	s.db = &fakeDB{}
	return s
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

func TestRequireFullAdminRejectsAViewer(t *testing.T) {
	s := newTestServer("", testSecret)
	token, err := session.SignAdmin(session.AdminClaims{Email: "v@mindfries.com", Name: "V", Role: "viewer", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if err != nil {
		t.Fatalf("SignAdmin: %v", err)
	}

	h := s.requireFullAdmin(func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run for a viewer") })
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/sessions/s1/reset", nil)
	req.AddCookie(&http.Cookie{Name: session.AdminCookie, Value: token})
	rec := httptest.NewRecorder()
	h(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (viewer, not admin)", rec.Code)
	}
}

func TestRequireFullAdminAcceptsAnAdmin(t *testing.T) {
	s := newTestServer("", testSecret)
	token, err := session.SignAdmin(session.AdminClaims{Email: "a@mindfries.com", Name: "A", Role: "admin", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if err != nil {
		t.Fatalf("SignAdmin: %v", err)
	}

	called := false
	h := s.requireFullAdmin(func(w http.ResponseWriter, r *http.Request) { called = true })
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/sessions/s1/reset", nil)
	req.AddCookie(&http.Cookie{Name: session.AdminCookie, Value: token})
	h(httptest.NewRecorder(), req)

	if !called {
		t.Fatal("handler should run for a full admin")
	}
}

func TestRequireFullAdminStillRejectsAMissingCookie(t *testing.T) {
	// requireFullAdmin composes on top of requireAdmin — the authentication
	// check still applies, not just the role check.
	s := newTestServer("", testSecret)
	h := s.requireFullAdmin(func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodPost, "/api/v1/admin/sessions/s1/reset", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
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

// A good signature isn't enough once the account has withdrawn its
// sessions, been disabled, or gone.
func TestRequireCandidateRefusesAWithdrawnSession(t *testing.T) {
	withdrawn := time.Now().Add(-time.Minute)
	cases := []struct {
		name, id string
		iat      time.Time
		standing db.AccountStanding
		want     int
	}{
		{"issued before the withdrawal", "w1", withdrawn.Add(-time.Hour), db.AccountStanding{Found: true, Active: true, SessionsValidFrom: &withdrawn}, http.StatusUnauthorized},
		{"issued after it", "w2", time.Now(), db.AccountStanding{Found: true, Active: true, SessionsValidFrom: &withdrawn}, http.StatusOK},
		{"no issue time, from before they were recorded", "w3", time.Time{}, db.AccountStanding{Found: true, Active: true, SessionsValidFrom: &withdrawn}, http.StatusUnauthorized},
		{"no issue time, nothing withdrawn", "w4", time.Time{}, db.AccountStanding{Found: true, Active: true}, http.StatusOK},
		{"a disabled account", "w5", time.Now(), db.AccountStanding{Found: true}, http.StatusUnauthorized},
		{"an account that is gone", "w6", time.Now(), db.AccountStanding{}, http.StatusUnauthorized},
	}
	for _, c := range cases {
		s := newTestServer(testSecret, "")
		s.db = &fakeDB{standing: map[string]db.AccountStanding{c.id: c.standing}}
		claims := session.CandidateClaims{ID: c.id, Email: "a@b.com", Name: "A", Exp: time.Now().Add(time.Hour).Unix()}
		if !c.iat.IsZero() {
			claims.Iat = c.iat.Unix()
		}
		token, err := session.SignCandidate(claims, testSecret)
		if err != nil {
			t.Fatalf("SignCandidate: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
		req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: token})
		rec := httptest.NewRecorder()
		s.requireCandidate(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, rec.Code, c.want)
		}
	}
}
