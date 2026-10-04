package billing

import "testing"

func testPrices() PlanPrices {
	return PlanPrices{Starter: "price_starter", Growth: "price_growth", Enterprise: "price_enterprise"}
}

func TestPriceIDResolvesConfiguredPlans(t *testing.T) {
	p := testPrices()
	for plan, want := range map[string]string{"starter": "price_starter", "growth": "price_growth", "enterprise": "price_enterprise"} {
		got, ok := p.PriceID(plan)
		if !ok || got != want {
			t.Fatalf("PriceID(%q) = (%q, %v), want (%q, true)", plan, got, ok, want)
		}
	}
}

func TestPriceIDRejectsUnknownPlan(t *testing.T) {
	if _, ok := (PlanPrices{}).PriceID("enterprise-plus"); ok {
		t.Fatal("PriceID should reject an unrecognized plan name")
	}
}

func TestPriceIDRejectsUnconfiguredPlan(t *testing.T) {
	// Starter is left empty: even though "starter" is a recognized plan
	// name, there's no real Price behind it yet, so this must say false,
	// not silently resolve to an empty string Stripe would reject anyway.
	p := PlanPrices{Growth: "price_growth"}
	if _, ok := p.PriceID("starter"); ok {
		t.Fatal("PriceID should reject a plan with no configured Price ID")
	}
}

func TestPlanForPriceResolvesKnownPrices(t *testing.T) {
	p := testPrices()
	if got := p.PlanForPrice("price_growth"); got != "growth" {
		t.Fatalf("PlanForPrice(price_growth) = %q, want growth", got)
	}
}

func TestPlanForPriceRejectsUnknownPrice(t *testing.T) {
	p := testPrices()
	if got := p.PlanForPrice("price_from_some_other_product"); got != "" {
		t.Fatalf("PlanForPrice(unknown) = %q, want empty string", got)
	}
}

func TestPlanForPriceDoesNotMatchEmptyAgainstUnconfiguredSlot(t *testing.T) {
	// Enterprise is left unconfigured (""); a price id that happens to be
	// empty (shouldn't occur with real Stripe data, but worth pinning) must
	// not resolve to "enterprise" just because both are "".
	p := PlanPrices{Starter: "price_starter"}
	if got := p.PlanForPrice(""); got != "" {
		t.Fatalf("PlanForPrice(\"\") = %q, want empty string (not a false match on an unconfigured slot)", got)
	}
}
