package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Invitation is one row of `assessments` (supabase/migrations/0002_product.sql)
// — a specific candidate invited by a specific company to run a specific
// template. This is the real per-candidate invitation the PRD's data model
// (§1.10) calls for, distinct from the open pool of published templates any
// candidate can self-start (Template, in assessments.go). CANDIDATE_BACKEND_PLAN.md
// §5–§6.1 is what this closes: "assessments... has never been read or
// written by any code in the repo."
type Invitation struct {
	ID             string
	CompanyID      string
	CompanyName    string
	TemplateID     string
	TemplateName   string
	TaskVariant    string
	TechStack      []string
	DurationMin    int
	CandidateEmail string
	CandidateName  *string
	Role           *string
	Status         string // invited|in_progress|submitted|closed
	DueDate        *string
	MatchScore     *int
}

const invitationColumns = `
	a.id, a.company_id, coalesce(c.name, '—'),
	a.template_id, coalesce(t.name, 'Untitled assessment'), coalesce(t.task_variant, ''),
	coalesce(t.tech_stack, '{}'), coalesce(t.duration_min, 60),
	a.candidate_email, a.candidate_name, a.role, a.status,
	to_char(a.due_date, 'YYYY-MM-DD'), a.match_score
`

func scanInvitation(row pgx.Row) (Invitation, error) {
	var inv Invitation
	err := row.Scan(
		&inv.ID, &inv.CompanyID, &inv.CompanyName,
		&inv.TemplateID, &inv.TemplateName, &inv.TaskVariant,
		&inv.TechStack, &inv.DurationMin,
		&inv.CandidateEmail, &inv.CandidateName, &inv.Role, &inv.Status,
		&inv.DueDate, &inv.MatchScore,
	)
	return inv, err
}

// ListInvitationsForCandidate is a real per-candidate query — unlike
// ListPublishedTemplates (the open pool, identical for every candidate),
// this returns only the assessments a company actually invited *this*
// candidate to, matched by email the same way the rest of the schema
// already does (candidate_users, assessments — both lower-cased email
// lookups).
func (d *DB) ListInvitationsForCandidate(ctx context.Context, candidateEmail string) ([]Invitation, error) {
	rows, err := d.pool.Query(ctx, `
		select `+invitationColumns+`
		from assessments a
		left join companies c on c.id = a.company_id
		left join game_templates t on t.id = a.template_id
		where lower(a.candidate_email) = lower($1)
		order by a.created_at desc
	`, candidateEmail)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Invitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// GetInvitation loads one invitation by id, for starting or submitting a
// session against it. Ownership (candidate_email matches the caller) is
// checked by the caller, the same pattern as ownsSession in httpapi —
// this function itself doesn't know who's asking.
func (d *DB) GetInvitation(ctx context.Context, id string) (Invitation, error) {
	row := d.pool.QueryRow(ctx, `
		select `+invitationColumns+`
		from assessments a
		left join companies c on c.id = a.company_id
		left join game_templates t on t.id = a.template_id
		where a.id = $1
	`, id)
	inv, err := scanInvitation(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Invitation{}, ErrNotFound
	}
	return inv, err
}

// SetInvitationStatus moves an invitation through its lifecycle
// (invited -> in_progress -> submitted) as the session behind it does the
// same — the two stay in lockstep because the orchestrator changes both in
// the same request, not because either enforces it on the other.
func (d *DB) SetInvitationStatus(ctx context.Context, id, status string) error {
	_, err := d.pool.Exec(ctx, `update assessments set status = $2 where id = $1`, id, status)
	return err
}

// CreateInvitation is the writer CANDIDATE_BACKEND_PLAN.md §6.1 and
// ADMIN_BACKEND_PLAN.md §5.4 both call for from opposite sides: an admin
// action picks a company, a candidate, and a template, and this is what
// makes that a real row instead of nothing. companyID/templateID must
// already exist — the foreign keys enforce that; this function doesn't
// re-check it first.
func (d *DB) CreateInvitation(ctx context.Context, companyID, templateID, candidateEmail string, candidateName, role *string, dueDate *string) (Invitation, error) {
	row := d.pool.QueryRow(ctx, `
		insert into assessments (company_id, template_id, candidate_email, candidate_name, role, due_date)
		values ($1, $2, $3, $4, $5, nullif($6, '')::date)
		returning id
	`, companyID, templateID, candidateEmail, candidateName, role, ptrOrEmpty(dueDate))
	var id string
	if err := row.Scan(&id); err != nil {
		return Invitation{}, err
	}
	return d.GetInvitation(ctx, id)
}

func ptrOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
