package httpapi

import "github.com/mindfries/company-backend/internal/session"

// Action and matrix are ported 1:1 from
// company/frontend/lib/auth/permissions.ts — the same action names, the same
// role lists — so frontend and backend can never silently drift apart on who
// is allowed to do what. If that file changes, this one must change with it.
type Action string

const (
	ActionRoleWrite       Action = "role:write" // create/edit/close a job role
	ActionCandidateInvite Action = "candidate:invite"
	ActionCandidateStage  Action = "candidate:stage" // shortlist/reject/hire
	ActionTeamManage      Action = "team:manage"     // invite/remove teammates, change their role
	ActionBillingManage   Action = "billing:manage"  // view or change billing — admin-only to even view
)

var matrix = map[Action][]session.CompanyRole{
	ActionRoleWrite:       {session.RoleAdmin, session.RoleRecruiter},
	ActionCandidateInvite: {session.RoleAdmin, session.RoleRecruiter},
	ActionCandidateStage:  {session.RoleAdmin, session.RoleRecruiter},
	ActionTeamManage:      {session.RoleAdmin},
	ActionBillingManage:   {session.RoleAdmin},
}

func can(action Action, role session.CompanyRole) bool {
	for _, r := range matrix[action] {
		if r == role {
			return true
		}
	}
	return false
}
