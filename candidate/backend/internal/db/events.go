package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// ActivityEvent is one row of activity_events (0006_events_and_reports.sql)
// — the raw material of PRD §1.7's evidence capture: navigation, file edits,
// git actions, terminal commands, test runs, AI-assistant use.
type ActivityEvent struct {
	ID         int64
	SessionID  string
	EventType  string
	Payload    json.RawMessage
	OccurredAt time.Time
}

// NewActivityEvent is the shape a client posts — no id or timestamp, the
// database assigns both.
type NewActivityEvent struct {
	EventType string
	Payload   json.RawMessage
}

// InsertActivityEvents batch-inserts a session's events inside one
// transaction, so a partially-sent batch never leaves half its events
// recorded. Empty input is a no-op, not an error — a client flushing an
// empty buffer is normal, not exceptional.
func (d *DB) InsertActivityEvents(ctx context.Context, sessionID string, events []NewActivityEvent) error {
	if len(events) == 0 {
		return nil
	}
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	batch := make([][]any, 0, len(events))
	for _, e := range events {
		payload := e.Payload
		if payload == nil {
			payload = json.RawMessage("{}")
		}
		batch = append(batch, []any{sessionID, e.EventType, payload})
	}
	_, err = tx.CopyFrom(ctx,
		pgx.Identifier{"activity_events"},
		[]string{"session_id", "event_type", "payload"},
		pgx.CopyFromRows(batch),
	)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// GetSessionEvents loads every event for a session, oldest first — this is
// the evidence the orchestrator hands to the Code Evaluation, Reasoning and
// Workflow agents.
func (d *DB) GetSessionEvents(ctx context.Context, sessionID string) ([]ActivityEvent, error) {
	rows, err := d.pool.Query(ctx, `
		select id, session_id, event_type, payload, occurred_at
		from activity_events
		where session_id = $1
		order by occurred_at asc
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ActivityEvent
	for rows.Next() {
		var e ActivityEvent
		if err := rows.Scan(&e.ID, &e.SessionID, &e.EventType, &e.Payload, &e.OccurredAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
