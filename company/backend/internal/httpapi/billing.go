package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/mindfries/company-backend/internal/billing"
)

// billingDTO mirrors company/frontend/lib/types.ts's CompanyBilling.
type billingDTO struct {
	Plan              string `json:"plan"`
	SeatsTotal        int    `json:"seatsTotal"`
	SeatsUsed         int    `json:"seatsUsed"`
	OpenRoles         int    `json:"openRoles"`
	CandidatesInvited int    `json:"candidatesInvited"`
}

// handleGetBilling mirrors getCompanyBilling.
func (s *Server) handleGetBilling(w http.ResponseWriter, r *http.Request) {
	company := companyFrom(r)
	b, err := s.db.GetCompanyBilling(r.Context(), company.CompanyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load billing")
		return
	}
	writeJSON(w, http.StatusOK, billingDTO{
		Plan: b.Plan, SeatsTotal: b.SeatsTotal, SeatsUsed: b.SeatsUsed,
		OpenRoles: b.OpenRoles, CandidatesInvited: b.CandidatesInvited,
	})
}

type checkoutSessionRequest struct {
	Plan     string `json:"plan"`
	Quantity int64  `json:"quantity"`
}

// handleCreateCheckoutSession opens a Stripe Checkout Session for a plan
// purchase or seat change. 503s with an honest message if Stripe isn't
// configured, rather than a confusing failure from the Stripe SDK itself.
func (s *Server) handleCreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	if !s.stripe.Configured() {
		notConfigured(w, "billing")
		return
	}

	var req checkoutSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}
	priceID, ok := s.plans.PriceID(req.Plan)
	if !ok {
		writeError(w, http.StatusBadRequest, "plan must be starter, growth, or enterprise, and have a configured price")
		return
	}

	company := companyFrom(r)
	companyRow, err := s.db.GetCompany(r.Context(), company.CompanyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load this company's billing record")
		return
	}

	sess, err := s.stripe.CreateCheckoutSession(billing.CreateCheckoutSessionInput{
		PriceID: priceID, Quantity: req.Quantity, CompanyID: company.CompanyID,
		ExistingCustomerID: companyRow.StripeCustomerID,
		SuccessURL:         s.cfg.CompanyFrontendURL + "/settings/billing?checkout=success",
		CancelURL:          s.cfg.CompanyFrontendURL + "/settings/billing?checkout=cancelled",
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "Stripe couldn't start checkout — try again")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": sess.URL})
}

// handleCreatePortalSession opens a Stripe-hosted self-serve management
// session. 404s with a clear message if this company has never checked out
// — there is no Stripe customer to open a portal session for yet.
func (s *Server) handleCreatePortalSession(w http.ResponseWriter, r *http.Request) {
	if !s.stripe.Configured() {
		notConfigured(w, "billing")
		return
	}

	company := companyFrom(r)
	companyRow, err := s.db.GetCompany(r.Context(), company.CompanyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load this company's billing record")
		return
	}
	if companyRow.StripeCustomerID == nil || *companyRow.StripeCustomerID == "" {
		writeError(w, http.StatusNotFound, "no billing account yet — start a checkout first")
		return
	}

	sess, err := s.stripe.CreateBillingPortalSession(*companyRow.StripeCustomerID, s.cfg.CompanyFrontendURL+"/settings/billing")
	if err != nil {
		writeError(w, http.StatusBadGateway, "Stripe couldn't open the billing portal — try again")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": sess.URL})
}
