package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mindfries/company-backend/internal/config"
	"github.com/mindfries/company-backend/internal/session"
)

const testSecret = "test-secret-at-least-32-characters-long!!"

func newTestServer(companySecret string) *Server {
	return New(config.Config{CompanySessionSecret: companySecret, AllowedOrigins: []string{"http://localhost:3002"}}, nil)
}

func TestRequireCompanyRejectsMissingCookie(t *testing.T) {
	s := newTestServer(testSecret)
	called := false
	h := s.requireCompany(func(w http.ResponseWriter, r *http.Request) { called = true })

	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))

	if called {
		t.Fatal("handler should not run without a session cookie")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestRequireCompanyRejectsWhenSecretUnset(t *testing.T) {
	s := newTestServer("")
	h := s.requireCompany(func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })

	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (not configured)", rec.Code)
	}
}

func TestRequireCompanyAcceptsValidCookieAndInjectsClaims(t *testing.T) {
	s := newTestServer(testSecret)
	token, err := session.SignCompany(session.CompanyClaims{
		Email: "a@b.com", Name: "A", Role: session.RoleAdmin, CompanyID: "c1", CompanyName: "Acme",
		Exp: time.Now().Add(time.Hour).Unix(),
	}, testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}

	var gotCompanyID string
	h := s.requireCompany(func(w http.ResponseWriter, r *http.Request) { gotCompanyID = companyFrom(r).CompanyID })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.AddCookie(&http.Cookie{Name: session.CompanyCookie, Value: token})
	h(httptest.NewRecorder(), req)

	if gotCompanyID != "c1" {
		t.Fatalf("companyFrom(r).CompanyID = %q, want c1", gotCompanyID)
	}
}

func signToken(t *testing.T, role session.CompanyRole, secret string) string {
	t.Helper()
	token, err := session.SignCompany(session.CompanyClaims{
		Email: "a@b.com", Name: "A", Role: role, CompanyID: "c1", CompanyName: "Acme",
		Exp: time.Now().Add(time.Hour).Unix(),
	}, secret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	return token
}

func TestRequireActionAllowsPermittedRole(t *testing.T) {
	s := newTestServer(testSecret)
	called := false
	h := s.requireAction(ActionRoleWrite, func(w http.ResponseWriter, r *http.Request) { called = true })

	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles", nil)
	req.AddCookie(&http.Cookie{Name: session.CompanyCookie, Value: signToken(t, session.RoleRecruiter, testSecret)})
	rec := httptest.NewRecorder()
	h(rec, req)

	if !called || rec.Code != http.StatusOK {
		t.Fatalf("recruiter should be allowed role:write — called=%v status=%d", called, rec.Code)
	}
}

func TestRequireActionRejectsDisallowedRole(t *testing.T) {
	s := newTestServer(testSecret)
	called := false
	h := s.requireAction(ActionBillingManage, func(w http.ResponseWriter, r *http.Request) { called = true })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/billing", nil)
	req.AddCookie(&http.Cookie{Name: session.CompanyCookie, Value: signToken(t, session.RoleRecruiter, testSecret)})
	rec := httptest.NewRecorder()
	h(rec, req)

	if called {
		t.Fatal("recruiter must not reach billing:manage")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestRequireActionRejectsViewerFromMutatingRoute(t *testing.T) {
	s := newTestServer(testSecret)
	h := s.requireAction(ActionCandidateStage, func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })

	req := httptest.NewRequest(http.MethodPost, "/api/v1/candidates/1/stage", nil)
	req.AddCookie(&http.Cookie{Name: session.CompanyCookie, Value: signToken(t, session.RoleViewer, testSecret)})
	rec := httptest.NewRecorder()
	h(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestHealthEndpoint(t *testing.T) {
	s := newTestServer(testSecret)
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
