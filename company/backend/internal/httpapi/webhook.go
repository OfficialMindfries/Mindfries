package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"github.com/stripe/stripe-go/v82"
)

// maxWebhookBody bounds how much of the request body this handler reads —
// Stripe's own payloads are small (a few KB), so a much larger body is
// either a misconfigured endpoint or not actually Stripe; refusing it
// outright is cheaper than buffering an unbounded body first.
const maxWebhookBody = 64 * 1024

// handleStripeWebhook verifies the Stripe-Signature header against the raw
// body, checks the idempotency table, and applies a plan/seat change for
// the two subscription-lifecycle events this service cares about. Every
// other event type is acknowledged (200) and ignored — Stripe only stops
// retrying on a 2xx, and there's no reason to make it retry an event this
// handler was never going to act on.
func (s *Server) handleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	if !s.stripe.WebhookConfigured() {
		notConfigured(w, "the Stripe webhook")
		return
	}

	payload, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookBody+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "couldn't read request body")
		return
	}
	if len(payload) > maxWebhookBody {
		writeError(w, http.StatusRequestEntityTooLarge, "payload too large")
		return
	}

	event, err := s.stripe.ParseWebhookEvent(payload, r.Header.Get("Stripe-Signature"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid signature")
		return
	}

	seen, err := s.db.SeenWebhookEvent(r.Context(), event.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't check event idempotency")
		return
	}
	if seen {
		writeJSON(w, http.StatusOK, map[string]string{"status": "already processed"})
		return
	}

	if err := s.applyStripeEvent(r, event); err != nil {
		slog.Error("stripe webhook: apply failed", "type", event.Type, "id", event.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "couldn't apply this event")
		return
	}

	if err := s.db.RecordWebhookEvent(r.Context(), event.ID); err != nil {
		slog.Error("stripe webhook: recording event id failed", "id", event.ID, "error", err)
		// The event was already applied; a replay would just re-apply the
		// same plan/seat values idempotently, so this isn't worth refusing
		// the webhook over (Stripe would only retry it).
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) applyStripeEvent(r *http.Request, event stripe.Event) error {
	switch event.Type {
	case stripe.EventTypeCheckoutSessionCompleted:
		var sess stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
			return err
		}
		if sess.ClientReferenceID == "" || sess.Customer == nil {
			return nil // not one of this service's checkout sessions
		}
		var subscriptionID *string
		if sess.Subscription != nil && sess.Subscription.ID != "" {
			id := sess.Subscription.ID
			subscriptionID = &id
		}
		return s.db.SetCompanyStripeIDs(r.Context(), sess.ClientReferenceID, sess.Customer.ID, subscriptionID)

	case stripe.EventTypeCustomerSubscriptionUpdated, stripe.EventTypeCustomerSubscriptionDeleted:
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return err
		}
		if sub.Customer == nil {
			return nil
		}
		company, err := s.db.GetCompanyByStripeCustomerID(r.Context(), sub.Customer.ID)
		if err != nil {
			return nil // no company matches this customer — nothing to apply
		}

		if event.Type == stripe.EventTypeCustomerSubscriptionDeleted {
			return s.db.ApplyPlanAndSeats(r.Context(), company.ID, "trial", company.Seats)
		}

		plan := "trial"
		seats := company.Seats
		if sub.Items != nil && len(sub.Items.Data) > 0 {
			item := sub.Items.Data[0]
			seats = int(item.Quantity)
			if item.Price != nil {
				if p := s.plans.PlanForPrice(item.Price.ID); p != "" {
					plan = p
				}
			}
		}
		return s.db.ApplyPlanAndSeats(r.Context(), company.ID, plan, seats)

	default:
		return nil
	}
}
