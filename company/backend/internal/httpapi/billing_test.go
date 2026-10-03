package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mindfries/company-backend/internal/config"
)

func testConfigWithStripeWebhook() config.Config {
	return config.Config{
		CompanySessionSecret: testSecret,
		AllowedOrigins:       []string{"http://localhost:3002"},
		StripeWebhookSecret:  testWebhookSecretForHTTP,
	}
}

const testWebhookSecretForHTTP = "whsec_test_secret_for_http_layer"

func TestCreateCheckoutSessionNotConfiguredWithoutStripeKey(t *testing.T) {
	s := newTestServer(testSecret) // no Stripe keys set
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/checkout-session", httptestBody(`{"plan":"growth"}`))
	rec := httptest.NewRecorder()
	s.handleCreateCheckoutSession(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (not configured)", rec.Code)
	}
}

func TestCreatePortalSessionNotConfiguredWithoutStripeKey(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/portal-session", nil)
	rec := httptest.NewRecorder()
	s.handleCreatePortalSession(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (not configured)", rec.Code)
	}
}

func TestStripeWebhookNotConfiguredWithoutWebhookSecret(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/stripe", httptestBody(`{}`))
	rec := httptest.NewRecorder()
	s.handleStripeWebhook(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (not configured)", rec.Code)
	}
}

func TestStripeWebhookRejectsBadSignature(t *testing.T) {
	s := New(testConfigWithStripeWebhook(), nil)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/stripe", httptestBody(`{"id":"evt_1"}`))
	req.Header.Set("Stripe-Signature", "t=1,v1=not_a_real_signature")
	rec := httptest.NewRecorder()
	s.handleStripeWebhook(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (invalid signature)", rec.Code)
	}
}

func TestBillingManageGatesEvenTheRead(t *testing.T) {
	// permissions.ts marks billing admin-only to VIEW, not just change —
	// pinning that a recruiter can't reach GET /api/v1/billing either.
	s := newTestServer(testSecret)
	h := s.requireAction(ActionBillingManage, func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/billing", nil)
	req.AddCookie(&http.Cookie{Name: "mf_company", Value: signToken(t, "recruiter", testSecret)})
	rec := httptest.NewRecorder()
	h(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}
