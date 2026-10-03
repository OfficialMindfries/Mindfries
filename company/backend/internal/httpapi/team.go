package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mindfries/company-backend/internal/db"
	"github.com/mindfries/company-backend/internal/session"
)

// teamUserDTO is the wire shape — camelCase, matching
// company/frontend/lib/types.ts's CompanyUser field for field.
type teamUserDTO struct {
	ID        string `json:"id"`
	CompanyID string `json:"companyId"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

func toTeamUserDTO(u db.CompanyUser) teamUserDTO {
	return teamUserDTO{
		ID: u.ID, CompanyID: u.CompanyID, Email: u.Email, Name: u.Name,
		Role: u.Role, Status: u.Status, CreatedAt: u.CreatedAt,
	}
}

// handleListTeam mirrors listCompanyUsers. Any signed-in role may view the
// roster — team:manage only gates the mutating routes below, matching
// permissions.ts (the matrix names who can invite/remove/change roles, not
// who can see the list).
func (s *Server) handleListTeam(w http.ResponseWriter, r *http.Request) {
	company := companyFrom(r)
	users, err := s.db.ListCompanyUsers(r.Context(), company.CompanyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load the team")
		return
	}
	out := make([]teamUserDTO, 0, len(users))
	for _, u := range users {
		out = append(out, toTeamUserDTO(u))
	}
	writeJSON(w, http.StatusOK, out)
}

type inviteTeamRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

func validCompanyRole(r string) bool {
	return r == string(session.RoleAdmin) || r == string(session.RoleRecruiter) || r == string(session.RoleViewer)
}

// handleInviteTeam mirrors the data half of inviteCompanyUser — it creates
// the "invited" row only. Signing and sending the invite link is
// company/frontend's job (see db.InviteCompanyUser's doc comment); the
// caller is expected to do that itself once this call returns the new row.
func (s *Server) handleInviteTeam(w http.ResponseWriter, r *http.Request) {
	var req inviteTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "email and name are required")
		return
	}
	if !validCompanyRole(req.Role) {
		writeError(w, http.StatusBadRequest, "role must be admin, recruiter, or viewer")
		return
	}

	company := companyFrom(r)
	user, err := s.db.InviteCompanyUser(r.Context(), db.InviteCompanyUserInput{
		CompanyID: company.CompanyID, Email: req.Email, Name: req.Name, Role: req.Role,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't invite that teammate — try again")
		return
	}
	writeJSON(w, http.StatusCreated, toTeamUserDTO(*user))
}

type setTeamStatusRequest struct {
	Status string `json:"status"`
}

// handleSetTeamStatus mirrors setCompanyUserStatus. A richer role-change
// surface isn't built on the frontend yet (only active/disabled exists
// today), so this endpoint doesn't invent one either — same scope
// discipline handleCreateRole/handlePatchRole already apply in roles.go.
func (s *Server) handleSetTeamStatus(w http.ResponseWriter, r *http.Request) {
	var req setTeamStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Status != "active" && req.Status != "disabled" {
		writeError(w, http.StatusBadRequest, "status must be active or disabled")
		return
	}

	company := companyFrom(r)
	userID := r.PathValue("id")
	if err := s.db.SetCompanyUserStatus(r.Context(), company.CompanyID, userID, req.Status); err != nil {
		if errors.Is(err, db.ErrCompanyUserNotFound) {
			writeError(w, http.StatusNotFound, "teammate not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "couldn't update that teammate — try again")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": userID, "status": req.Status})
}
