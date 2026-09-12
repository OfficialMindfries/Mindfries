package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Report is one assessment_reports row (0006_events_and_reports.sql) —
// PRD §1.10's ASSESSMENT_REPORT.
type Report struct {
	ID             string
	SessionID      string
	Status         string // pending|generating|ready|failed
	Recommendation *string
	Summary        *string
	Error          *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// EvidenceItem is one evidence_items row — PRD §1.10's EVIDENCE_ITEM, one
// observation from one agent.
type EvidenceItem struct {
	ID          string
	ReportID    string
	Category    string // code_evaluation|reasoning|workflow|interview
	Observation string
	CreatedAt   time.Time
}

// CreatePendingReport creates the report row a session's evaluation writes
// into, or returns the existing one — re-triggering evaluation (PRD §1.11's
// support override) reuses the same report id rather than creating a
// second one per session (the table's unique(session_id) constraint is what
// makes this an upsert rather than a race).
func (d *DB) CreatePendingReport(ctx context.Context, sessionID string) (Report, error) {
	row := d.pool.QueryRow(ctx, `
		insert into assessment_reports (session_id, status)
		values ($1, 'pending')
		on conflict (session_id) do update set status = 'pending', error = null, updated_at = now()
		returning id, session_id, status, recommendation, summary, error, created_at, updated_at
	`, sessionID)
	return scanReport(row)
}

func scanReport(row pgx.Row) (Report, error) {
	var r Report
	err := row.Scan(&r.ID, &r.SessionID, &r.Status, &r.Recommendation, &r.Summary, &r.Error, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

// GetReportBySession is what the candidate-facing "has my report landed yet"
// endpoint polls.
func (d *DB) GetReportBySession(ctx context.Context, sessionID string) (Report, error) {
	row := d.pool.QueryRow(ctx, `
		select id, session_id, status, recommendation, summary, error, created_at, updated_at
		from assessment_reports where session_id = $1
	`, sessionID)
	r, err := scanReport(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Report{}, ErrNotFound
	}
	return r, err
}

// SetReportGenerating marks a report as actively being written, so a second
// submit or retrigger while one run is in flight is visible as "already
// running" rather than starting a duplicate.
func (d *DB) SetReportGenerating(ctx context.Context, reportID string) error {
	_, err := d.pool.Exec(ctx, `update assessment_reports set status = 'generating', updated_at = now() where id = $1`, reportID)
	return err
}

// SaveReportResult stores the Report agent's output — recommendation,
// summary, and each agent's evidence items — as one transaction: a report
// never ends up "ready" with its evidence still pending, or vice versa.
func (d *DB) SaveReportResult(ctx context.Context, reportID, recommendation, summary string, items []EvidenceItem) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		update assessment_reports
		set status = 'ready', recommendation = $2, summary = $3, error = null, updated_at = now()
		where id = $1
	`, reportID, recommendation, summary); err != nil {
		return err
	}

	for _, it := range items {
		if _, err := tx.Exec(ctx, `
			insert into evidence_items (report_id, category, observation)
			values ($1, $2, $3)
		`, reportID, it.Category, it.Observation); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// SaveReportFailure records why generation failed — an honest status, not a
// silently-stuck "generating" row.
func (d *DB) SaveReportFailure(ctx context.Context, reportID, reason string) error {
	_, err := d.pool.Exec(ctx, `
		update assessment_reports set status = 'failed', error = $2, updated_at = now() where id = $1
	`, reportID, reason)
	return err
}

// GetEvidenceItems loads every observation for a report, grouped by nothing
// in particular here — the caller (the API response) groups by category.
func (d *DB) GetEvidenceItems(ctx context.Context, reportID string) ([]EvidenceItem, error) {
	rows, err := d.pool.Query(ctx, `
		select id, report_id, category, observation, created_at
		from evidence_items where report_id = $1
		order by created_at asc
	`, reportID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []EvidenceItem
	for rows.Next() {
		var it EvidenceItem
		if err := rows.Scan(&it.ID, &it.ReportID, &it.Category, &it.Observation, &it.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
