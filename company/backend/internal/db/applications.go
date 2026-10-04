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

// InviteCandidateInput mirrors inviteCandidateToRole's input shape.
type InviteCandidateInput struct {
	CompanyID      string
	JobRoleID      string
	CandidateEmail string
	CandidateName  *string
	DueDate        *string
}

// InviteCandidate mirrors inviteCandidateToRole: a two-table write
// (assessments, then candidate_applications), in that order and for the
// same documented reason the TS version states — a failure on the second
// insert leaves an assessments row unlinked rather than the invite silently
// not happening at all. Not a single transaction, same tradeoff the TS
// version accepts (it's already running against the one database both
// sides share; this doesn't change that constraint).
func (d *DB) InviteCandidate(ctx context.Context, in InviteCandidateInput) (*CandidateApplication, error) {
	role, err := d.GetJobRole(ctx, in.CompanyID, in.JobRoleID)
	if err != nil {
		return nil, err
	}

	var assessmentID string
	err = d.pool.QueryRow(ctx, `
		insert into assessments (company_id, template_id, candidate_email, candidate_name, role, due_date)
		values ($1, $2, $3, $4, $5, $6)
		returning id
	`, in.CompanyID, role.TemplateID, in.CandidateEmail, in.CandidateName, role.Title, in.DueDate).Scan(&assessmentID)
	if err != nil {
		return nil, err
	}

	var id string
	err = d.pool.QueryRow(ctx, `
		insert into candidate_applications (job_role_id, assessment_id, candidate_email, candidate_name, stage)
		values ($1, $2, $3, $4, 'invited')
		returning id
	`, in.JobRoleID, assessmentID, in.CandidateEmail, in.CandidateName).Scan(&id)
	if err != nil {
		return nil, err
	}

	a, err := d.GetApplicationForCompany(ctx, in.CompanyID, id)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// BulkSetApplicationStage mirrors bulkSetApplicationStage — scoped the same
// way: the role must belong to this company (GetJobRole's existing check),
// and the update itself is pinned to job_role_id = roleID, so a crafted id
// for someone else's candidate just doesn't match a row rather than
// silently touching it.
func (d *DB) BulkSetApplicationStage(ctx context.Context, companyID, roleID string, applicationIDs []string, stage string) error {
	if len(applicationIDs) == 0 {
		return nil
	}
	if _, err := d.GetJobRole(ctx, companyID, roleID); err != nil {
		return err
	}
	_, err := d.pool.Exec(ctx, `
		update candidate_applications
		set stage = $1
		where job_role_id = $2 and id = any($3)
	`, stage, roleID, applicationIDs)
	return err
}

// DueCandidate mirrors company/frontend/lib/types.ts's DueCandidate.
type DueCandidate struct {
	ApplicationID  string
	CandidateName  *string
	CandidateEmail string
	RoleTitle      string
	DueDate        string
}

// ListUpcomingDueDates mirrors listUpcomingDueDates: every candidate
// application for this company whose assessment has a due_date set,
// soonest first.
func (d *DB) ListUpcomingDueDates(ctx context.Context, companyID string) ([]DueCandidate, error) {
	rows, err := d.pool.Query(ctx, `
		select ca.id, ca.candidate_name, ca.candidate_email, jr.title, a.due_date
		from candidate_applications ca
		join job_roles jr on jr.id = ca.job_role_id
		join assessments a on a.id = ca.assessment_id
		where jr.company_id = $1 and a.due_date is not null
		order by a.due_date asc
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DueCandidate
	for rows.Next() {
		var c DueCandidate
		var dueDate time.Time
		if err := rows.Scan(&c.ApplicationID, &c.CandidateName, &c.CandidateEmail, &c.RoleTitle, &dueDate); err != nil {
			return nil, err
		}
		c.DueDate = dueDate.Format("2006-01-02")
		out = append(out, c)
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
