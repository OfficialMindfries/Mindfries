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
// (supabase/migrations/0002_product.sql, candidate_id added in 0006,
// sandbox_id added in 0009).
type Session struct {
	ID            string
	AssessmentID  *string
	CompanyID     *string
	TemplateID    *string
	CandidateID   *string
	CandidateName string
	Status        string
	SandboxHealth string
	SandboxID     *string
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

const sessionColumns = `id, assessment_id, company_id, template_id, candidate_id, candidate_name, status, sandbox_health, sandbox_id, progress_pct, duration_min, elapsed_min, started_at`

func scanSession(row pgx.Row) (Session, error) {
	var s Session
	err := row.Scan(&s.ID, &s.AssessmentID, &s.CompanyID, &s.TemplateID, &s.CandidateID, &s.CandidateName, &s.Status, &s.SandboxHealth, &s.SandboxID, &s.ProgressPct, &s.DurationMin, &s.ElapsedMin, &s.StartedAt)
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

// StartSessionFromInvitation is StartSession's counterpart for a real,
// company-issued invitation (the `assessments` table) rather than the open
// self-serve pool: the resulting session carries assessment_id and
// company_id too, so it can be traced back to the specific invitation it
// came from — the exact link CANDIDATE_BACKEND_PLAN.md §6.2 asked for.
func (d *DB) StartSessionFromInvitation(ctx context.Context, candidateID, candidateName string, inv Invitation) (Session, error) {
	row := d.pool.QueryRow(ctx, `
		insert into sessions (assessment_id, company_id, template_id, candidate_id, candidate_name, status, duration_min)
		values ($1, $2, $3, $4, $5, 'live', $6)
		returning `+sessionColumns, inv.ID, inv.CompanyID, inv.TemplateID, candidateID, candidateName, inv.DurationMin)
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
const sessionColumnsQualified = `s.id, s.assessment_id, s.company_id, s.template_id, s.candidate_id, s.candidate_name, s.status, s.sandbox_health, s.sandbox_id, s.progress_pct, s.duration_min, s.elapsed_min, s.started_at`

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
		err := rows.Scan(&r.ID, &r.AssessmentID, &r.CompanyID, &r.TemplateID, &r.CandidateID, &r.CandidateName, &r.Status, &r.SandboxHealth, &r.SandboxID, &r.ProgressPct, &r.DurationMin, &r.ElapsedMin, &r.StartedAt, &r.CompanyName, &r.TemplateName)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ErrAlreadySubmitted means a session's status was no longer "live" at the
// moment this tried to move it to "submitted" — either it was already
// submitted, or a concurrent request beat this one to it. Distinct from a
// plain write failure so the caller can tell "someone already did this" from
// "the database is unhappy."
var ErrAlreadySubmitted = errors.New("db: session already submitted")

// MarkSubmitted is the one conditional write that makes "a session can only
// be submitted once" true even under a race — two concurrent submit requests
// (a double-click, a retried request) can both pass an earlier read-then-check
// in the HTTP handler; only the `where status = 'live'` here decides which
// one, if either, actually gets to run evaluation. Loses the same way a
// unique constraint would, just phrased as a conditional update instead of a
// second column.
func (d *DB) MarkSubmitted(ctx context.Context, id string) error {
	tag, err := d.pool.Exec(ctx, `update sessions set status = 'submitted' where id = $1 and status = 'live'`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAlreadySubmitted
	}
	return nil
}

// SetSandboxID records (or clears, passing nil) which Daytona sandbox
// belongs to a session — set once, right after CreateSandbox returns a real
// ID, and cleared once DeleteSandbox has torn it down. A direct assignment,
// not a coalesce like UpdateSessionState's patch below: clearing to NULL is
// exactly the point once a sandbox is gone, and coalesce can't express that.
func (d *DB) SetSandboxID(ctx context.Context, id string, sandboxID *string) error {
	_, err := d.pool.Exec(ctx, `update sessions set sandbox_id = $2 where id = $1`, id, sandboxID)
	return err
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
