package db

import "context"

// Company is the slice of companies this service's billing handlers need —
// not the full row (name/website/status aren't relevant here).
type Company struct {
	ID                   string
	Plan                 string
	Seats                int
	StripeCustomerID     *string
	StripeSubscriptionID *string
}

// GetCompany loads a company's billing-relevant fields by id.
func (d *DB) GetCompany(ctx context.Context, companyID string) (*Company, error) {
	var c Company
	err := d.pool.QueryRow(ctx, `
		select id, plan, seats, stripe_customer_id, stripe_subscription_id
		from companies where id = $1
	`, companyID).Scan(&c.ID, &c.Plan, &c.Seats, &c.StripeCustomerID, &c.StripeSubscriptionID)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetCompanyByStripeCustomerID resolves a company from a Stripe customer id
// — how the webhook finds which company a customer.subscription.* event is
// for, since that event carries no company id of its own.
func (d *DB) GetCompanyByStripeCustomerID(ctx context.Context, customerID string) (*Company, error) {
	var c Company
	err := d.pool.QueryRow(ctx, `
		select id, plan, seats, stripe_customer_id, stripe_subscription_id
		from companies where stripe_customer_id = $1
	`, customerID).Scan(&c.ID, &c.Plan, &c.Seats, &c.StripeCustomerID, &c.StripeSubscriptionID)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// SetCompanyStripeIDs records the Stripe customer/subscription a company
// now has — written once checkout completes (customerID is never nil at
// that point; subscriptionID may still be nil for a non-subscription
// checkout, though Phase 4 only ever creates subscription-mode sessions).
func (d *DB) SetCompanyStripeIDs(ctx context.Context, companyID, customerID string, subscriptionID *string) error {
	_, err := d.pool.Exec(ctx, `
		update companies set stripe_customer_id = $1, stripe_subscription_id = $2
		where id = $3
	`, customerID, subscriptionID, companyID)
	return err
}

// ApplyPlanAndSeats is the webhook's write-back — re-derives plan and seats
// from a subscription event and applies them atomically. Not scoped to a
// specific company_id check beyond the row update itself: the webhook
// resolves companyID via GetCompanyByStripeCustomerID first, which is
// already the trust boundary (only a row whose stripe_customer_id matches
// the event's customer resolves at all).
func (d *DB) ApplyPlanAndSeats(ctx context.Context, companyID, plan string, seats int) error {
	_, err := d.pool.Exec(ctx, `update companies set plan = $1, seats = $2 where id = $3`, plan, seats, companyID)
	return err
}

// CompanyBilling mirrors company/frontend/lib/types.ts's CompanyBilling —
// real counts, no invented numbers, same rule getCompanyBilling already
// follows.
type CompanyBilling struct {
	Plan              string
	SeatsTotal        int
	SeatsUsed         int
	OpenRoles         int
	CandidatesInvited int
}

// GetCompanyBilling mirrors getCompanyBilling exactly: plan/seats from
// companies, seatsUsed from active company_users, openRoles from job_roles,
// candidatesInvited from the full candidate_applications count for this
// company.
func (d *DB) GetCompanyBilling(ctx context.Context, companyID string) (CompanyBilling, error) {
	var b CompanyBilling
	err := d.pool.QueryRow(ctx, `select plan, seats from companies where id = $1`, companyID).Scan(&b.Plan, &b.SeatsTotal)
	if err != nil {
		return b, err
	}

	err = d.pool.QueryRow(ctx, `select count(*) from company_users where company_id = $1 and status = 'active'`, companyID).Scan(&b.SeatsUsed)
	if err != nil {
		return b, err
	}
	err = d.pool.QueryRow(ctx, `select count(*) from job_roles where company_id = $1 and status = 'open'`, companyID).Scan(&b.OpenRoles)
	if err != nil {
		return b, err
	}
	err = d.pool.QueryRow(ctx, `
		select count(*) from candidate_applications ca join job_roles jr on jr.id = ca.job_role_id where jr.company_id = $1
	`, companyID).Scan(&b.CandidatesInvited)
	if err != nil {
		return b, err
	}
	return b, nil
}
