package billing

import (
	"errors"

	"github.com/stripe/stripe-go/v82"
	billingportalsession "github.com/stripe/stripe-go/v82/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/webhook"
)

// Client wraps the Stripe Go SDK's package-level functions behind this
// service's own small surface — CreateCheckoutSession,
// CreateBillingPortalSession, ParseWebhookEvent — so httpapi's handlers
// never import the stripe package directly.
type Client struct {
	secretKey     string
	webhookSecret string
}

func New(secretKey, webhookSecret string) *Client {
	return &Client{secretKey: secretKey, webhookSecret: webhookSecret}
}

// Configured reports whether there's a secret key to call Stripe's API
// with at all. ParseWebhookEvent has its own separate check
// (WebhookConfigured) since a deployment can have one secret without the
// other (e.g. checkout wired up before the webhook endpoint is registered).
func (c *Client) Configured() bool { return c.secretKey != "" }

func (c *Client) WebhookConfigured() bool { return c.webhookSecret != "" }

// ErrNotConfigured is returned by every method here when the relevant
// secret is empty — the same "real, or an honest failure" rule the rest of
// this repo holds itself to, never a silent no-op or a fabricated success.
var ErrNotConfigured = errors.New("billing: Stripe is not configured")

// CreateCheckoutSessionInput is everything a checkout needs: which price,
// how many seats, which company it's for (ClientReferenceID, so the
// webhook can resolve it back), and an existing Stripe customer if this
// company already has one (nil lets Stripe create one at checkout).
type CreateCheckoutSessionInput struct {
	PriceID            string
	Quantity           int64
	CompanyID          string
	ExistingCustomerID *string
	SuccessURL         string
	CancelURL          string
}

// CreateCheckoutSession opens a subscription-mode Checkout Session for a
// plan purchase or seat change.
func (c *Client) CreateCheckoutSession(in CreateCheckoutSessionInput) (*stripe.CheckoutSession, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	stripe.Key = c.secretKey

	params := &stripe.CheckoutSessionParams{
		Mode:              stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		ClientReferenceID: stripe.String(in.CompanyID),
		SuccessURL:        stripe.String(in.SuccessURL),
		CancelURL:         stripe.String(in.CancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{{
			Price:    stripe.String(in.PriceID),
			Quantity: stripe.Int64(in.Quantity),
		}},
	}
	if in.ExistingCustomerID != nil && *in.ExistingCustomerID != "" {
		params.Customer = stripe.String(*in.ExistingCustomerID)
	}
	return checkoutsession.New(params)
}

// CreateBillingPortalSession opens a Stripe-hosted self-serve management
// session for a company's existing Stripe customer.
func (c *Client) CreateBillingPortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	stripe.Key = c.secretKey

	return billingportalsession.New(&stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String(returnURL),
	})
}

// ParseWebhookEvent verifies the Stripe-Signature header against the raw
// request body and the configured webhook secret, returning the decoded
// event only once the signature checks out. Stripe's own webhook package
// does the HMAC comparison; this is a thin wrapper so httpapi never imports
// the stripe SDK directly.
//
// IgnoreAPIVersionMismatch is deliberate: the Stripe Dashboard's webhook
// endpoint has its own configured API version, independent of whichever
// stripe-go version this service is compiled against — without this, a
// perfectly legitimate, correctly-signed event from a webhook endpoint
// configured for an older/newer API version is refused outright. The
// signature check above is what actually proves the event is genuine; the
// API version string is a deserialization-compatibility concern, not an
// authenticity one, verified while writing this against a real signed test
// payload (see stripe_test.go).
func (c *Client) ParseWebhookEvent(payload []byte, sigHeader string) (stripe.Event, error) {
	if !c.WebhookConfigured() {
		return stripe.Event{}, ErrNotConfigured
	}
	return webhook.ConstructEventWithOptions(payload, sigHeader, c.webhookSecret,
		webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true})
}
