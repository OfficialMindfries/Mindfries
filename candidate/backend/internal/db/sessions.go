package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrNotFound is returned by single-row lookups when nothing matches — every
// caller turns this into its own honest 404, rather than a bare
// "no rows in result set" leaking out of the data layer.
var ErrNotFound = errors.New("db: not found")

// Session is one candidate's live/past run — sessions rows
// (supabase/migrations/0002_product.sql, candidate_id added in 0006).
type Session struct {
	ID            string
	AssessmentID  *string
	CompanyID     *string
	TemplateID    *string
	CandidateID   *string
	CandidateName string
	Status        string
	SandboxHealth string
	ProgressPct   int
	DurationMin   int
	ElapsedMin    int
	StartedAt     time.Time
}

// AdminSessionRow is Session plus the joined company/template names the
// Global Session Monitor shows (internal-admin/frontend/lib/db.ts's
// listSessions / toSession).
type AdminSessionRow struct {
	Session
	CompanyName  string
	TemplateName string
}

const sessionColumns = `id, assessment_id, company_id, template_id, candidate_id, candidate_name, status, sandbox_health, progress_pct, duration_min, elapsed_min, started_at`

func scanSession(row pgx.Row) (Session, error) {
	var s Session
	err := row.Scan(&s.ID, &s.AssessmentID, &s.CompanyID, &s.TemplateID, &s.CandidateID, &s.CandidateName, &s.Status, &s.SandboxHealth, &s.ProgressPct, &s.DurationMin, &s.ElapsedMin, &s.StartedAt)
	return s, err
}

// StartSession is the Assessment Orchestrator's entry point: a signed-in
// candidate starts a published template, and a live session appears in the
// admin's Global Session Monitor — same effect as the TS startSession, but
// now attributed to a real candidate_id (CANDIDATE_BACKEND_PLAN.md §5's
// "startSession() takes a candidate id" target).
func (d *DB) StartSession(ctx context.Context, candidateID, candidateName string, tmpl Template) (Session, error) {
	row := d.pool.QueryRow(ctx, `
		insert into sessions (template_id, candidate_id, candidate_name, status, duration_min)
		values ($1, $2, $3, 'live', $4)
		returning `+sessionColumns, tmpl.ID, candidateID, candidateName, tmpl.DurationMin)
	return scanSession(row)
}

// GetSession fetches one session by id, for status polling, ownership
// checks, and the WebSocket handshake.
func (d *DB) GetSession(ctx context.Context, id string) (Session, error) {
	row := d.pool.QueryRow(ctx, `select `+sessionColumns+` from sessions where id = $1`, id)
	s, err := scanSession(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	return s, err
}

// sessionColumnsQualified is sessionColumns with every column qualified to
// the "s" alias — needed the moment a join brings in another table with any
// overlapping column name (game_templates also has its own "status", which
// is exactly what made the unqualified list ambiguous here before this).
const sessionColumnsQualified = `s.id, s.assessment_id, s.company_id, s.template_id, s.candidate_id, s.candidate_name, s.status, s.sandbox_health, s.progress_pct, s.duration_min, s.elapsed_min, s.started_at`

// ListAdminSessions mirrors internal-admin/frontend's listSessions — every
// session, newest first, with company and template names joined in.
func (d *DB) ListAdminSessions(ctx context.Context) ([]AdminSessionRow, error) {
	rows, err := d.pool.Query(ctx, `
		select `+sessionColumnsQualified+`, coalesce(c.name, '—'), coalesce(t.name, '—')
		from sessions s
		left join companies c on c.id = s.company_id
		left join game_templates t on t.id = s.template_id
		order by s.started_at desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AdminSessionRow
	for rows.Next() {
		var r AdminSessionRow
		err := rows.Scan(&r.ID, &r.AssessmentID, &r.CompanyID, &r.TemplateID, &r.CandidateID, &r.CandidateName, &r.Status, &r.SandboxHealth, &r.ProgressPct, &r.DurationMin, &r.ElapsedMin, &r.StartedAt, &r.CompanyName, &r.TemplateName)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SessionStatePatch is the support-override surface (PRD §1.11): reset a
// stuck sandbox, or hand-adjust progress. Only non-nil fields are written.
type SessionStatePatch struct {
	Status        *string
	SandboxHealth *string
	ProgressPct   *int
	ElapsedMin    *int
}

// UpdateSessionState applies a patch, mirroring internal-admin's
// setSessionState. Used both by the admin support-override endpoints and by
// the orchestrator itself as a session moves through its lifecycle.
func (d *DB) UpdateSessionState(ctx context.Context, id string, patch SessionStatePatch) error {
	_, err := d.pool.Exec(ctx, `
		update sessions set
			status         = coalesce($2, status),
			sandbox_health = coalesce($3, sandbox_health),
			progress_pct   = coalesce($4, progress_pct),
			elapsed_min    = coalesce($5, elapsed_min)
		where id = $1
	`, id, patch.Status, patch.SandboxHealth, patch.ProgressPct, patch.ElapsedMin)
	return err
}
