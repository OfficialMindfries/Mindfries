package db

import (
	"context"
	"encoding/json"
	"errors"
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

// ReplaceFlaggedEvent stores one event in place of every earlier event of
// the same type on this session whose payload carries `"<flag>": true`. It
// is for state that is saved over and over and only ever read at its latest
// — the workspace checkpoint — where appending would grow the trail by a
// whole codebase every couple of minutes. Events of that type without the
// flag are left alone.
func (d *DB) ReplaceFlaggedEvent(ctx context.Context, sessionID, flag string, event NewActivityEvent) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		delete from activity_events
		where session_id = $1 and event_type = $2 and payload ->> $3 = 'true'
	`, sessionID, event.EventType, flag); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into activity_events (session_id, event_type, payload) values ($1, $2, $3)
	`, sessionID, event.EventType, event.Payload); err != nil {
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

// HasEvent reports whether a session has at least one event of the given
// type — a cheap existence check for callers that would otherwise load a
// whole trail to answer a yes/no question.
func (d *DB) HasEvent(ctx context.Context, sessionID, eventType string) (bool, error) {
	var exists bool
	err := d.pool.QueryRow(ctx, `
		select exists (select 1 from activity_events where session_id = $1 and event_type = $2)
	`, sessionID, eventType).Scan(&exists)
	return exists, err
}

// LatestEventPayload returns the payload of a session's most recent event of
// the given type, or nil when it has none.
func (d *DB) LatestEventPayload(ctx context.Context, sessionID, eventType string) (json.RawMessage, error) {
	var payload json.RawMessage
	err := d.pool.QueryRow(ctx, `
		select payload from activity_events
		where session_id = $1 and event_type = $2
		order by occurred_at desc, id desc
		limit 1
	`, sessionID, eventType).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return payload, err
}

// LatestEvent returns a session's most recent event of the given type, or
// nil when it has none.
func (d *DB) LatestEvent(ctx context.Context, sessionID, eventType string) (*ActivityEvent, error) {
	var e ActivityEvent
	err := d.pool.QueryRow(ctx, `
		select id, session_id, event_type, payload, occurred_at
		from activity_events
		where session_id = $1 and event_type = $2
		order by occurred_at desc, id desc
		limit 1
	`, sessionID, eventType).Scan(&e.ID, &e.SessionID, &e.EventType, &e.Payload, &e.OccurredAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}
