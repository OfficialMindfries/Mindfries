package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mindfries/company-backend/internal/db"
)

// roleDTO is the wire shape — camelCase, matching
// company/frontend/lib/types.ts's JobRole field for field, so the frontend's
// future backend client can decode this directly into that type.
type roleDTO struct {
	ID           string          `json:"id"`
	CompanyID    string          `json:"companyId"`
	TemplateID   *string         `json:"templateId"`
	TemplateName *string         `json:"templateName"`
	Title        string          `json:"title"`
	TechStack    []string        `json:"techStack"`
	DurationMin  *int            `json:"durationMin"`
	Visibility   string          `json:"visibility"`
	Status       string          `json:"status"`
	CreatedAt    string          `json:"createdAt"`
	StageCounts  *db.StageCounts `json:"stageCounts,omitempty"`
}

func toRoleDTO(r db.JobRole) roleDTO {
	return roleDTO{
		ID: r.ID, CompanyID: r.CompanyID, TemplateID: r.TemplateID, TemplateName: r.TemplateName,
		Title: r.Title, TechStack: r.TechStack, DurationMin: r.DurationMin,
		Visibility: r.Visibility, Status: r.Status, CreatedAt: r.CreatedAt,
	}
}

// handleListRoles mirrors listJobRoles + a stageCountsForRole call per role
// — the same per-role query shape company/frontend's own /roles page already
// makes, just performed here instead.
func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	company := companyFrom(r)
	roles, err := s.db.ListJobRoles(r.Context(), company.CompanyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load roles")
		return
	}

	out := make([]roleDTO, 0, len(roles))
	for _, role := range roles {
		dto := toRoleDTO(role)
		counts, err := s.db.StageCountsForRole(r.Context(), role.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "couldn't load stage counts")
			return
		}
		dto.StageCounts = &counts
		out = append(out, dto)
	}
	writeJSON(w, http.StatusOK, out)
}

type createRoleRequest struct {
	Title       string   `json:"title"`
	TechStack   []string `json:"techStack"`
	DurationMin *int     `json:"durationMin"`
	Visibility  string   `json:"visibility"`
}

// handleCreateRole mirrors createJobRole.
func (s *Server) handleCreateRole(w http.ResponseWriter, r *http.Request) {
	var req createRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Visibility != "invite_only" && req.Visibility != "open_pool" {
		writeError(w, http.StatusBadRequest, "visibility must be invite_only or open_pool")
		return
	}

	company := companyFrom(r)
	role, err := s.db.CreateJobRole(r.Context(), db.CreateJobRoleInput{
		CompanyID: company.CompanyID, Title: req.Title, TechStack: req.TechStack,
		DurationMin: req.DurationMin, Visibility: req.Visibility,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't create that role — try again")
		return
	}
	writeJSON(w, http.StatusCreated, toRoleDTO(*role))
}

// handleGetRole mirrors getJobRole + listApplicationsForRole + stage
// counts — the role detail page's full pipeline view in one call.
func (s *Server) handleGetRole(w http.ResponseWriter, r *http.Request) {
	company := companyFrom(r)
	roleID := r.PathValue("id")

	role, err := s.db.GetJobRole(r.Context(), company.CompanyID, roleID)
	if err != nil {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}
	apps, err := s.db.ListApplicationsForRole(r.Context(), roleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load this role's pipeline")
		return
	}
	counts, err := s.db.StageCountsForRole(r.Context(), roleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load stage counts")
		return
	}

	dto := toRoleDTO(*role)
	dto.StageCounts = &counts

	applications := make([]applicationDTO, 0, len(apps))
	for _, a := range apps {
		applications = append(applications, toApplicationDTO(a, false))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"role":         dto,
		"applications": applications,
	})
}

type patchRoleRequest struct {
	TemplateID *string `json:"templateId"`
}

// handlePatchRole mirrors setJobRoleTemplate — the one mutation
// company/frontend currently exposes on an existing role. A richer
// edit/close surface isn't built on the frontend yet, so this endpoint
// doesn't invent one either.
func (s *Server) handlePatchRole(w http.ResponseWriter, r *http.Request) {
	var req patchRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	company := companyFrom(r)
	roleID := r.PathValue("id")
	if err := s.db.SetJobRoleTemplate(r.Context(), company.CompanyID, roleID, req.TemplateID); err != nil {
		if errors.Is(err, db.ErrRoleNotFound) {
			writeError(w, http.StatusNotFound, "role not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "couldn't update that role — try again")
		return
	}

	role, err := s.db.GetJobRole(r.Context(), company.CompanyID, roleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "updated, but couldn't reload the role")
		return
	}
	writeJSON(w, http.StatusOK, toRoleDTO(*role))
}
