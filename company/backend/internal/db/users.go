package db

import (
	"context"
	"errors"
	"time"
)

// CompanyUser mirrors company/frontend/lib/types.ts's CompanyUser and
// lib/db.ts's toCompanyUser row mapping. PasswordHash is deliberately not a
// field here — this service never authenticates a company_users row, only
// reads/writes the roster; company/frontend's own lib/auth owns password
// hashing and sign-in.
type CompanyUser struct {
	ID        string
	CompanyID string
	Email     string
	Name      string
	Role      string // "admin" | "recruiter" | "viewer"
	Status    string // "invited" | "active" | "disabled"
	CreatedAt string
}

func scanCompanyUser(row interface{ Scan(dest ...any) error }) (CompanyUser, error) {
	var u CompanyUser
	var createdAt time.Time
	err := row.Scan(&u.ID, &u.CompanyID, &u.Email, &u.Name, &u.Role, &u.Status, &createdAt)
	if err != nil {
		return u, err
	}
	u.CreatedAt = createdAt.Format(time.RFC3339)
	return u, nil
}

const companyUserSelect = `select id, company_id, email, name, role, status, created_at from company_users`

// ListCompanyUsers mirrors listCompanyUsers.
func (d *DB) ListCompanyUsers(ctx context.Context, companyID string) ([]CompanyUser, error) {
	rows, err := d.pool.Query(ctx, companyUserSelect+` where company_id = $1 order by created_at asc`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CompanyUser
	for rows.Next() {
		u, err := scanCompanyUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// InviteCompanyUserInput mirrors inviteCompanyUser's input shape. There is
// no PasswordHash here deliberately — an invited row has none until the
// invitee sets their own password through company/frontend's accept-invite
// flow (lib/auth), which writes it directly; this service never handles a
// password.
type InviteCompanyUserInput struct {
	CompanyID string
	Email     string
	Name      string
	Role      string
}

// InviteCompanyUser creates an "invited" company_users row — the data half
// of company/frontend's own inviteCompanyUser. Signing and sending the
// invite link stays in Next (lib/auth/invite-token.ts + lib/mailer.ts),
// which already owns COMPANY_INVITE_SECRET and the Resend API key; this
// service doesn't duplicate either secret just to send an email (see
// README's "why invite-email stays in Next").
func (d *DB) InviteCompanyUser(ctx context.Context, in InviteCompanyUserInput) (*CompanyUser, error) {
	var id string
	err := d.pool.QueryRow(ctx, `
		insert into company_users (company_id, email, name, role, status)
		values ($1, $2, $3, $4, 'invited')
		returning id
	`, in.CompanyID, in.Email, in.Name, in.Role).Scan(&id)
	if err != nil {
		return nil, err
	}
	row := d.pool.QueryRow(ctx, companyUserSelect+` where id = $1`, id)
	u, err := scanCompanyUser(row)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ErrCompanyUserNotFound mirrors setCompanyUserStatus's implicit "no row
// matched" case, made explicit as a sentinel so the HTTP layer can map it to
// 404 instead of a silent no-op.
var ErrCompanyUserNotFound = errors.New("db: company user not found")

// SetCompanyUserStatus mirrors setCompanyUserStatus — scoped to companyID so
// a request can't disable (or reactivate) a teammate at a different company.
func (d *DB) SetCompanyUserStatus(ctx context.Context, companyID, userID, status string) error {
	tag, err := d.pool.Exec(ctx, `
		update company_users set status = $1
		where company_id = $2 and id = $3
	`, status, companyID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCompanyUserNotFound
	}
	return nil
}

// SetCompanyUserRole mirrors setCompanyUserRole — same shape and scoping as
// SetCompanyUserStatus. The "can't leave zero active admins" guard lives in
// the caller (httpapi/team.go's handleSetTeamStatus), same as it does for
// status changes — this is a plain, unconditional write.
func (d *DB) SetCompanyUserRole(ctx context.Context, companyID, userID, role string) error {
	tag, err := d.pool.Exec(ctx, `
		update company_users set role = $1
		where company_id = $2 and id = $3
	`, role, companyID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCompanyUserNotFound
	}
	return nil
}
