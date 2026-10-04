package billing

import (
	"testing"
	"time"

	"github.com/stripe/stripe-go/v82/webhook"
)

const testWebhookSecret = "whsec_test_secret"

func TestParseWebhookEventAcceptsValidSignature(t *testing.T) {
	payload := []byte(`{"id":"evt_123","type":"checkout.session.completed","data":{"object":{}}}`)
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
		Payload: payload, Secret: testWebhookSecret, Timestamp: time.Now(),
	})

	c := New("sk_test_whatever", testWebhookSecret)
	event, err := c.ParseWebhookEvent(signed.Payload, signed.Header)
	if err != nil {
		t.Fatalf("ParseWebhookEvent: %v", err)
	}
	if event.ID != "evt_123" {
		t.Fatalf("event.ID = %q, want evt_123", event.ID)
	}
}

func TestParseWebhookEventRejectsBadSignature(t *testing.T) {
	payload := []byte(`{"id":"evt_123","type":"checkout.session.completed","data":{"object":{}}}`)
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
		Payload: payload, Secret: "whsec_a_different_secret", Timestamp: time.Now(),
	})

	c := New("sk_test_whatever", testWebhookSecret)
	if _, err := c.ParseWebhookEvent(signed.Payload, signed.Header); err == nil {
		t.Fatal("expected a signature verification error")
	}
}

func TestParseWebhookEventRejectsWhenNotConfigured(t *testing.T) {
	c := New("sk_test_whatever", "")
	if _, err := c.ParseWebhookEvent([]byte(`{}`), "whatever"); err != ErrNotConfigured {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
}

func TestCreateCheckoutSessionRejectsWhenNotConfigured(t *testing.T) {
	c := New("", testWebhookSecret)
	if _, err := c.CreateCheckoutSession(CreateCheckoutSessionInput{}); err != ErrNotConfigured {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
}

func TestCreateBillingPortalSessionRejectsWhenNotConfigured(t *testing.T) {
	c := New("", testWebhookSecret)
	if _, err := c.CreateBillingPortalSession("cus_123", "https://example.com"); err != ErrNotConfigured {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
}
