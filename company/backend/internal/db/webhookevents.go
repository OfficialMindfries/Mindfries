package db

import "context"

// SeenWebhookEvent reports whether this Stripe event id has already been
// recorded — the idempotency guard against Stripe's at-least-once webhook
// delivery, so a replayed event never double-applies a plan/seat change.
func (d *DB) SeenWebhookEvent(ctx context.Context, eventID string) (bool, error) {
	var exists bool
	err := d.pool.QueryRow(ctx, `select exists(select 1 from stripe_webhook_events where event_id = $1)`, eventID).Scan(&exists)
	return exists, err
}

// RecordWebhookEvent marks an event id as processed. "on conflict do
// nothing" rather than erroring on a duplicate insert — a second call
// racing the same event id (two webhook retries arriving concurrently)
// should be a harmless no-op, not a 500.
func (d *DB) RecordWebhookEvent(ctx context.Context, eventID string) error {
	_, err := d.pool.Exec(ctx, `insert into stripe_webhook_events (event_id) values ($1) on conflict (event_id) do nothing`, eventID)
	return err
}
