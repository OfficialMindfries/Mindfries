package db

import (
	"context"
	"errors"
	"time"
)

// JobRole mirrors company/frontend/lib/types.ts's JobRole and lib/db.ts's
// toJobRole row mapping field for field.
type JobRole struct {
	ID           string
	CompanyID    string
	TemplateID   *string
	TemplateName *string
	Title        string
	TechStack    []string
	DurationMin  *int
	Visibility   string // "invite_only" | "open_pool"
	Status       string // "open" | "closed"
	CreatedAt    string
}

const roleSelect = `
	select jr.id, jr.company_id, jr.template_id, gt.name, jr.title, jr.tech_stack,
	       jr.duration_min, jr.visibility, jr.status, jr.created_at
	from job_roles jr
	left join game_templates gt on gt.id = jr.template_id
`

// scanRole reads created_at into time.Time, not string — pgx's binary
// protocol refuses to scan a timestamptz directly into *string, unlike the
// JSON string PostgREST (what Supabase's own JS client talks to) hands
// back. Converted to RFC3339 right after scanning so the rest of this
// package, and the JSON wire shape, can keep treating it as the string
// company/frontend's lib/db.ts already expects.
func scanRole(row interface{ Scan(dest ...any) error }) (JobRole, error) {
	var r JobRole
	var createdAt time.Time
	err := row.Scan(&r.ID, &r.CompanyID, &r.TemplateID, &r.TemplateName, &r.Title,
		&r.TechStack, &r.DurationMin, &r.Visibility, &r.Status, &createdAt)
	if err != nil {
		return r, err
	}
	r.CreatedAt = createdAt.Format(time.RFC3339)
	return r, nil
}

// ListJobRoles mirrors company/frontend/lib/db.ts's listJobRoles.
func (d *DB) ListJobRoles(ctx context.Context, companyID string) ([]JobRole, error) {
	rows, err := d.pool.Query(ctx, roleSelect+` where jr.company_id = $1 order by jr.created_at desc`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []JobRole
	for rows.Next() {
		r, err := scanRole(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetJobRole mirrors getJobRole — scoped to companyID so a request can't
// reach another company's role by id.
func (d *DB) GetJobRole(ctx context.Context, companyID, roleID string) (*JobRole, error) {
	row := d.pool.QueryRow(ctx, roleSelect+` where jr.company_id = $1 and jr.id = $2`, companyID, roleID)
	r, err := scanRole(row)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// CreateJobRoleInput mirrors createJobRole's input shape — no template
// attached at creation, same as the frontend's own scope call.
type CreateJobRoleInput struct {
	CompanyID   string
	Title       string
	TechStack   []string
	DurationMin *int
	Visibility  string
}

// CreateJobRole mirrors createJobRole.
func (d *DB) CreateJobRole(ctx context.Context, in CreateJobRoleInput) (*JobRole, error) {
	var id string
	err := d.pool.QueryRow(ctx, `
		insert into job_roles (company_id, title, tech_stack, duration_min, visibility)
		values ($1, $2, $3, $4, $5)
		returning id
	`, in.CompanyID, in.Title, in.TechStack, in.DurationMin, in.Visibility).Scan(&id)
	if err != nil {
		return nil, err
	}
	return d.GetJobRole(ctx, in.CompanyID, id)
}

// ErrRoleNotFound is returned when a role id doesn't resolve for the given
// company — never distinguished from "doesn't exist at all" to a caller, so
// a request for someone else's role id looks identical to a typo.
var ErrRoleNotFound = errors.New("db: role not found")

// SetJobRoleTemplate mirrors setJobRoleTemplate.
func (d *DB) SetJobRoleTemplate(ctx context.Context, companyID, roleID string, templateID *string) error {
	tag, err := d.pool.Exec(ctx, `
		update job_roles set template_id = $1
		where id = $2 and company_id = $3
	`, templateID, roleID, companyID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoleNotFound
	}
	return nil
}

// SetJobRoleStatus mirrors setJobRoleStatus — closes or reopens a role.
func (d *DB) SetJobRoleStatus(ctx context.Context, companyID, roleID, status string) error {
	tag, err := d.pool.Exec(ctx, `
		update job_roles set status = $1
		where id = $2 and company_id = $3
	`, status, roleID, companyID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoleNotFound
	}
	return nil
}

// StageCounts mirrors company/frontend/lib/types.ts's StageCounts — one
// count per ApplicationStage, zero-filled for stages with no rows.
type StageCounts struct {
	Invited     int `json:"invited"`
	InProgress  int `json:"in_progress"`
	Completed   int `json:"completed"`
	Shortlisted int `json:"shortlisted"`
	Rejected    int `json:"rejected"`
	Hired       int `json:"hired"`
}

// StageCountsForRole mirrors stageCountsForRole.
func (d *DB) StageCountsForRole(ctx context.Context, roleID string) (StageCounts, error) {
	var c StageCounts
	rows, err := d.pool.Query(ctx, `select stage from candidate_applications where job_role_id = $1`, roleID)
	if err != nil {
		return c, err
	}
	defer rows.Close()

	for rows.Next() {
		var stage string
		if err := rows.Scan(&stage); err != nil {
			return c, err
		}
		switch stage {
		case "invited":
			c.Invited++
		case "in_progress":
			c.InProgress++
		case "completed":
			c.Completed++
		case "shortlisted":
			c.Shortlisted++
		case "rejected":
			c.Rejected++
		case "hired":
			c.Hired++
		}
	}
	return c, rows.Err()
}
