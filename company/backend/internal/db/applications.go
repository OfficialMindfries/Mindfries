package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// CandidateApplication mirrors company/frontend/lib/types.ts's
// CandidateApplication and lib/db.ts's toApplication row mapping.
type CandidateApplication struct {
	ID             string
	JobRoleID      string
	AssessmentID   *string
	CandidateName  *string
	CandidateEmail string
	Stage          string // ApplicationStage
	Score          *int
	SectionScores  map[string]float64
	TimeTakenMin   *int
	CompletedAt    *string
	CreatedAt      string
	// RoleTitle is only populated by the cross-role / single-lookup queries
	// below (CandidateApplicationWithRole in the TS types) — "—" when a role
	// was deleted out from under an application, same fallback the frontend
	// uses.
	RoleTitle string
}

// scanApplication reads created_at/completed_at into time.Time — pgx's
// binary protocol refuses to scan a timestamptz directly into *string, so
// both are converted to RFC3339 right after scanning (see roles.go's
// scanRole, same fix, same reason).
func scanApplication(row interface{ Scan(dest ...any) error }, withRole bool) (CandidateApplication, error) {
	var a CandidateApplication
	var sectionScoresRaw []byte
	var createdAt time.Time
	var completedAt *time.Time
	dest := []any{&a.ID, &a.JobRoleID, &a.AssessmentID, &a.CandidateName, &a.CandidateEmail,
		&a.Stage, &a.Score, &sectionScoresRaw, &a.TimeTakenMin, &completedAt, &createdAt}
	if withRole {
		dest = append(dest, &a.RoleTitle)
	}
	if err := row.Scan(dest...); err != nil {
		return a, err
	}
	a.CreatedAt = createdAt.Format(time.RFC3339)
	if completedAt != nil {
		s := completedAt.Format(time.RFC3339)
		a.CompletedAt = &s
	}
	if len(sectionScoresRaw) > 0 {
		if err := json.Unmarshal(sectionScoresRaw, &a.SectionScores); err != nil {
			return a, err
		}
	}
	return a, nil
}

const applicationCols = `
	ca.id, ca.job_role_id, ca.assessment_id, ca.candidate_name, ca.candidate_email,
	ca.stage, ca.score, ca.section_scores, ca.time_taken_min, ca.completed_at, ca.created_at
`

// ListApplicationsForRole mirrors listApplicationsForRole.
func (d *DB) ListApplicationsForRole(ctx context.Context, roleID string) ([]CandidateApplication, error) {
	rows, err := d.pool.Query(ctx, `
		select `+applicationCols+`
		from candidate_applications ca
		where ca.job_role_id = $1
		order by ca.created_at desc
	`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CandidateApplication
	for rows.Next() {
		a, err := scanApplication(rows, false)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ListApplicationsForCompany mirrors listApplicationsForCompany — cross-role,
// scoped to the company via an inner join so a role belonging to another
// company never surfaces here.
func (d *DB) ListApplicationsForCompany(ctx context.Context, companyID string) ([]CandidateApplication, error) {
	rows, err := d.pool.Query(ctx, `
		select `+applicationCols+`, jr.title
		from candidate_applications ca
		join job_roles jr on jr.id = ca.job_role_id
		where jr.company_id = $1
		order by ca.created_at desc
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CandidateApplication
	for rows.Next() {
		a, err := scanApplication(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetApplicationForCompany mirrors getApplicationForCompany — scoped to
// companyID the same way, so a candidate id for another company's
// application resolves to nil, not someone else's data.
func (d *DB) GetApplicationForCompany(ctx context.Context, companyID, applicationID string) (*CandidateApplication, error) {
	row := d.pool.QueryRow(ctx, `
		select `+applicationCols+`, jr.title
		from candidate_applications ca
		join job_roles jr on jr.id = ca.job_role_id
		where jr.company_id = $1 and ca.id = $2
	`, companyID, applicationID)
	a, err := scanApplication(row, true)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// GetApplicationsForCompany is the candidate-compare batch lookup (2-4
// ids) — each id is independently scoped to companyID, same as
// GetApplicationForCompany; an id that doesn't resolve is simply absent
// from the result rather than failing the whole request, so the caller can
// decide whether a missing id means 404.
func (d *DB) GetApplicationsForCompany(ctx context.Context, companyID string, applicationIDs []string) ([]CandidateApplication, error) {
	if len(applicationIDs) == 0 {
		return nil, nil
	}
	rows, err := d.pool.Query(ctx, `
		select `+applicationCols+`, jr.title
		from candidate_applications ca
		join job_roles jr on jr.id = ca.job_role_id
		where jr.company_id = $1 and ca.id = any($2)
	`, companyID, applicationIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CandidateApplication
	for rows.Next() {
		a, err := scanApplication(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ErrApplicationNotFound mirrors setApplicationStage's "Candidate not found"
// — kept as a sentinel so the HTTP layer can map it to 404 instead of 500.
var ErrApplicationNotFound = errors.New("db: application not found")

// ValidStages is ApplicationStage's full set — the same six values
// candidate_applications.stage is constrained to by convention (no DB CHECK
// constraint exists yet, so the Go and TypeScript layers are this value
// set's only enforcement; keep both in sync if it ever changes).
var ValidStages = map[string]bool{
	"invited": true, "in_progress": true, "completed": true,
	"shortlisted": true, "rejected": true, "hired": true,
}

// SetApplicationStage mirrors setApplicationStage — scoped through job_roles
// the same way every other write here is, so a request can't move a
// candidate that belongs to a different company's role.
func (d *DB) SetApplicationStage(ctx context.Context, companyID, applicationID, stage string) error {
	tag, err := d.pool.Exec(ctx, `
		update candidate_applications ca
		set stage = $1
		from job_roles jr
		where ca.job_role_id = jr.id and jr.company_id = $2 and ca.id = $3
	`, stage, companyID, applicationID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrApplicationNotFound
	}
	return nil
}
