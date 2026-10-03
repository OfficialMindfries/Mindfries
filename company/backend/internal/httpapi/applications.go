package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/mindfries/company-backend/internal/db"
)

// applicationDTO is the wire shape — camelCase, matching
// company/frontend/lib/types.ts's CandidateApplication (plus roleTitle for
// CandidateApplicationWithRole), so the frontend's future backend client can
// decode this directly into that type.
type applicationDTO struct {
	ID             string             `json:"id"`
	JobRoleID      string             `json:"jobRoleId"`
	AssessmentID   *string            `json:"assessmentId"`
	CandidateName  *string            `json:"candidateName"`
	CandidateEmail string             `json:"candidateEmail"`
	Stage          string             `json:"stage"`
	Score          *int               `json:"score"`
	SectionScores  map[string]float64 `json:"sectionScores"`
	TimeTakenMin   *int               `json:"timeTakenMin"`
	CompletedAt    *string            `json:"completedAt"`
	CreatedAt      string             `json:"createdAt"`
	RoleTitle      string             `json:"roleTitle,omitempty"`
}

func toApplicationDTO(a db.CandidateApplication, withRole bool) applicationDTO {
	dto := applicationDTO{
		ID: a.ID, JobRoleID: a.JobRoleID, AssessmentID: a.AssessmentID, CandidateName: a.CandidateName,
		CandidateEmail: a.CandidateEmail, Stage: a.Stage, Score: a.Score, SectionScores: a.SectionScores,
		TimeTakenMin: a.TimeTakenMin, CompletedAt: a.CompletedAt, CreatedAt: a.CreatedAt,
	}
	if dto.SectionScores == nil {
		dto.SectionScores = map[string]float64{}
	}
	if withRole {
		dto.RoleTitle = a.RoleTitle
	}
	return dto
}

// handleListCandidates mirrors listApplicationsForCompany — cross-role.
// Search/filtering stays client-side against this full list, matching how
// company/frontend's own /candidates page already works; this endpoint
// doesn't invent server-side pagination that doesn't exist yet.
func (s *Server) handleListCandidates(w http.ResponseWriter, r *http.Request) {
	company := companyFrom(r)
	apps, err := s.db.ListApplicationsForCompany(r.Context(), company.CompanyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load candidates")
		return
	}
	out := make([]applicationDTO, 0, len(apps))
	for _, a := range apps {
		out = append(out, toApplicationDTO(a, true))
	}
	writeJSON(w, http.StatusOK, out)
}

// handleGetCandidate mirrors getApplicationForCompany.
func (s *Server) handleGetCandidate(w http.ResponseWriter, r *http.Request) {
	company := companyFrom(r)
	app, err := s.db.GetApplicationForCompany(r.Context(), company.CompanyID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "candidate not found")
		return
	}
	writeJSON(w, http.StatusOK, toApplicationDTO(*app, true))
}

// handleCompareCandidates mirrors the /candidates/compare page's own
// id-list resolution: 2-4 ids, every one of which must belong to this
// company, or the whole request 404s — a candidate shouldn't learn from a
// partial result that an id exists under a different company.
func (s *Server) handleCompareCandidates(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("ids")
	var ids []string
	for _, id := range strings.Split(raw, ",") {
		if id = strings.TrimSpace(id); id != "" {
			ids = append(ids, id)
		}
	}
	// Dedupe while preserving order, same as the frontend's own compare page.
	seen := map[string]bool{}
	deduped := ids[:0]
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			deduped = append(deduped, id)
		}
	}
	ids = deduped

	if len(ids) < 2 || len(ids) > 4 {
		writeError(w, http.StatusBadRequest, "compare takes 2 to 4 candidate ids")
		return
	}

	company := companyFrom(r)
	apps, err := s.db.GetApplicationsForCompany(r.Context(), company.CompanyID, ids)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load candidates")
		return
	}
	if len(apps) != len(ids) {
		writeError(w, http.StatusNotFound, "one or more candidates not found")
		return
	}

	out := make([]applicationDTO, 0, len(apps))
	for _, a := range apps {
		out = append(out, toApplicationDTO(a, true))
	}
	writeJSON(w, http.StatusOK, out)
}

type setStageRequest struct {
	Stage string `json:"stage"`
}

// handleSetCandidateStage mirrors setApplicationStage.
func (s *Server) handleSetCandidateStage(w http.ResponseWriter, r *http.Request) {
	var req setStageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !db.ValidStages[req.Stage] {
		writeError(w, http.StatusBadRequest, "not a valid stage")
		return
	}

	company := companyFrom(r)
	if err := s.db.SetApplicationStage(r.Context(), company.CompanyID, r.PathValue("id"), req.Stage); err != nil {
		if errors.Is(err, db.ErrApplicationNotFound) {
			writeError(w, http.StatusNotFound, "candidate not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "couldn't update that candidate — try again")
		return
	}

	app, err := s.db.GetApplicationForCompany(r.Context(), company.CompanyID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "updated, but couldn't reload the candidate")
		return
	}
	writeJSON(w, http.StatusOK, toApplicationDTO(*app, true))
}
