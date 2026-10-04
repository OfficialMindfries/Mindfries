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

// handlePatchRole mirrors setJobRoleTemplate and setJobRoleStatus. Decoded
// as raw JSON (rather than a struct with *string fields) specifically
// because templateId's nil is itself meaningful ("detach the template") —
// a struct of *string fields can't tell "detach" apart from "field wasn't
// in this request at all," so presence is checked against the raw key set
// before either mutation runs. Status has no such ambiguity (a role status
// is never intentionally null), but is checked the same way for symmetry.
func (s *Server) handlePatchRole(w http.ResponseWriter, r *http.Request) {
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	templateRaw, hasTemplate := raw["templateId"]
	statusRaw, hasStatus := raw["status"]
	if !hasTemplate && !hasStatus {
		writeError(w, http.StatusBadRequest, "templateId or status is required")
		return
	}

	var templateID *string
	if hasTemplate {
		if err := json.Unmarshal(templateRaw, &templateID); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	var status string
	if hasStatus {
		if err := json.Unmarshal(statusRaw, &status); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if status != "open" && status != "closed" {
			writeError(w, http.StatusBadRequest, "status must be open or closed")
			return
		}
	}

	company := companyFrom(r)
	roleID := r.PathValue("id")

	if hasTemplate {
		if err := s.db.SetJobRoleTemplate(r.Context(), company.CompanyID, roleID, templateID); err != nil {
			if errors.Is(err, db.ErrRoleNotFound) {
				writeError(w, http.StatusNotFound, "role not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "couldn't update that role — try again")
			return
		}
	}
	if hasStatus {
		if err := s.db.SetJobRoleStatus(r.Context(), company.CompanyID, roleID, status); err != nil {
			if errors.Is(err, db.ErrRoleNotFound) {
				writeError(w, http.StatusNotFound, "role not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "couldn't update that role — try again")
			return
		}
	}

	role, err := s.db.GetJobRole(r.Context(), company.CompanyID, roleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "updated, but couldn't reload the role")
		return
	}
	writeJSON(w, http.StatusOK, toRoleDTO(*role))
}
