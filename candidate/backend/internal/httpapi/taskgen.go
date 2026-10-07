package httpapi

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/mindfries/candidate-backend/internal/llm"
	"github.com/mindfries/candidate-backend/internal/session"
	"github.com/mindfries/candidate-backend/internal/verify"
)

// Task generation: a brief, a starter codebase and its reference solution,
// drafted by the Task Generation agent and then run (internal/verify) to
// find out whether the tests really fail as given and pass once solved.
//
// Two front doors, one implementation: Mindfries' own admins author library
// tasks from the admin portal, and a company's admins and recruiters
// generate tasks for their own roles from the company portal. Either way
// nothing is stored here — the draft and what running it found go back to
// the author, who reads them, edits, and saves.

// A job description and a sample of a codebase are much larger than the few
// lines of notes this endpoint started with.
const maxTaskGenerationBytes = 512 * 1024

type generateTaskRequest struct {
	Name        string   `json:"name"`
	TaskVariant string   `json:"taskVariant"`
	TechStack   []string `json:"techStack"`
	DurationMin int      `json:"durationMin"`
	Notes       string   `json:"notes"`
	// JobDescription and Codebase are what a company can build a task from
	// instead of notes: the role as advertised, and some of its own code.
	JobDescription string            `json:"jobDescription"`
	Codebase       map[string]string `json:"codebase"`
	// DifferentFrom is the brief of an existing task to write a variant of.
	DifferentFrom string `json:"differentFrom"`
}

type generateTaskResponse struct {
	llm.GeneratedTask
	// Verification is what running the draft found. Always present: when it
	// couldn't be run, its status is "not_run" and it says why.
	Verification verify.Report `json:"verification"`
}

func (s *Server) generateTask(w http.ResponseWriter, r *http.Request, who string) {
	var body generateTaskRequest
	if !decodeBody(w, r, maxTaskGenerationBytes, &body) {
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if s.orc.Agents == nil || !s.orc.Agents.Configured() {
		notConfigured(w, "the AI service")
		return
	}

	task, err := s.orc.Agents.GenerateTask(r.Context(), llm.TaskSpec{
		Name: body.Name, TaskVariant: body.TaskVariant, TechStack: body.TechStack,
		DurationMin: body.DurationMin, Notes: body.Notes,
		JobDescription: body.JobDescription, Codebase: body.Codebase, DifferentFrom: body.DifferentFrom,
	})
	if err != nil {
		slog.Error("generateTask", "by", who, "error", err)
		writeError(w, http.StatusBadGateway, "the model didn't return a usable task — try again")
		return
	}

	report := verify.Check(r.Context(), s.verifier, verify.Task{
		StarterFiles:  task.StarterFiles,
		SolutionFiles: task.SolutionFiles,
		// A refactoring task starts with its tests green; everything else
		// starts with something failing.
		ExpectStarterToPass: strings.Contains(strings.ToLower(body.TaskVariant), "refactor"),
	})
	slog.Info("generateTask", "by", who, "files", len(task.StarterFiles), "verification", report.Status)
	writeJSON(w, http.StatusOK, generateTaskResponse{GeneratedTask: task, Verification: report})
}

// handleAdminGenerateTask drafts a task for the Game Library's authoring form.
func (s *Server) handleAdminGenerateTask(w http.ResponseWriter, r *http.Request) {
	s.generateTask(w, r, "admin:"+adminFrom(r).Email)
}

// handleCompanyGenerateTask drafts a task for one of a company's own roles.
func (s *Server) handleCompanyGenerateTask(w http.ResponseWriter, r *http.Request) {
	c := companyFrom(r)
	s.generateTask(w, r, "company:"+c.CompanyID+":"+c.Email)
}

// requireCompanyWriter admits a signed-in company user who may create and
// change roles — an admin or a recruiter, the same rule the Company Portal
// applies to its own role pages ("role:write"). It verifies the "mf_company"
// cookie company/frontend issues, with that app's own secret.
func (s *Server) requireCompanyWriter(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.CompanySessionSecret == "" {
			notConfigured(w, "company authentication")
			return
		}
		cookie, err := r.Cookie(session.CompanyCookie)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		claims, err := session.VerifyCompany(cookie.Value, s.cfg.CompanySessionSecret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		if claims.Role != "admin" && claims.Role != "recruiter" {
			writeError(w, http.StatusForbidden, "your account can't create tasks — ask a company admin")
			return
		}
		next.ServeHTTP(w, withCompany(r, claims))
	}
}
