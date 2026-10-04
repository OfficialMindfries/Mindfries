package httpapi

import "net/http"

// templateDTO is the wire shape — camelCase, matching
// company/frontend/lib/types.ts's GameTemplate field for field.
type templateDTO struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	TaskVariant string   `json:"taskVariant"`
	TechStack   []string `json:"techStack"`
	DurationMin int      `json:"durationMin"`
}

// handleListTemplates mirrors listPublishedTemplates.
func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := s.db.ListPublishedTemplates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "couldn't load templates")
		return
	}
	out := make([]templateDTO, 0, len(templates))
	for _, t := range templates {
		out = append(out, templateDTO{
			ID: t.ID, Name: t.Name, TaskVariant: t.TaskVariant, TechStack: t.TechStack, DurationMin: t.DurationMin,
		})
	}
	writeJSON(w, http.StatusOK, out)
}
