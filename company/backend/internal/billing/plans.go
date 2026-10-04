// Package billing is real Stripe integration — Phase 4, the one backlog
// item from IMPLEMENTATION.md that genuinely needs a backend (webhook
// signature verification, idempotent plan/seat sync), per ARCHITECTURE.md's
// "FastAPI/Go is for compute, not CRUD" carve-out. Everything else in this
// service (roles, candidates, team) is CRUD by comparison; this package is
// the one part that actually computes/verifies something Supabase can't.
package billing

// PlanPrices maps a plan name to its Stripe Price ID, built from
// config.Config's STRIPE_PRICE_* env vars — never hardcoded, same rule
// every other cross-service address in this repo follows.
type PlanPrices struct {
	Starter    string
	Growth     string
	Enterprise string
}

// PriceID resolves a plan name to its configured Stripe Price ID. The
// second return is false for "trial" (never purchased, no Price exists) or
// an unrecognized name.
func (p PlanPrices) PriceID(plan string) (string, bool) {
	switch plan {
	case "starter":
		return p.Starter, p.Starter != ""
	case "growth":
		return p.Growth, p.Growth != ""
	case "enterprise":
		return p.Enterprise, p.Enterprise != ""
	default:
		return "", false
	}
}

// PlanForPrice is PriceID's reverse — used by the webhook handler to turn a
// subscription's Price ID back into the plan name companies.plan stores.
// Falls back to "" (caller decides what that means) rather than guessing.
func (p PlanPrices) PlanForPrice(priceID string) string {
	if priceID == "" {
		// Without this, an empty priceID would match whichever plan slot
		// (Starter/Growth/Enterprise) happens to be left unconfigured —
		// caught by this package's own test suite, not hypothetical.
		return ""
	}
	switch priceID {
	case p.Starter:
		return "starter"
	case p.Growth:
		return "growth"
	case p.Enterprise:
		return "enterprise"
	default:
		return ""
	}
}
