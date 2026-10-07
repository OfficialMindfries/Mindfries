package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/mindfries/candidate-backend/internal/llm"
	"github.com/mindfries/candidate-backend/internal/orchestrator"
)

// Limits on what a candidate's browser can send the AI endpoints. The model
// is the expensive part, so these bound what reaches it as well as what
// reaches the database.
const (
	maxAssistantBodyBytes  = 256 * 1024
	maxAssistantMessage    = 4000
	maxAssistantFileBytes  = 20 * 1024
	maxWorkspaceBodyBytes  = 1024 * 1024
	maxInterviewAnswer     = 6000
	maxTaskGenerationBytes = 32 * 1024
)

// aiError maps an orchestrator/LLM failure onto a response the workspace can
// show as-is. "Not configured" is its own status so the UI can say the
// feature is off rather than that it broke.
func aiError(w http.ResponseWriter, where string, err error) {
	switch {
	case errors.Is(err, orchestrator.ErrNotConfigured):
		notConfigured(w, "the AI service")
	case errors.Is(err, orchestrator.ErrAssistantLimit):
		writeError(w, http.StatusTooManyRequests, "you've reached the assistant message limit for this session")
	case errors.Is(err, orchestrator.ErrWorkLocked):
		writeError(w, http.StatusConflict, "the interview has started, so the assistant is closed")
	case errors.Is(err, orchestrator.ErrNoQuestionWaiting):
		writeError(w, http.StatusConflict, "there's no interview question waiting for an answer")
	default:
		slog.Error(where, "error", err)
		writeError(w, http.StatusBadGateway, "the AI service didn't answer — try again")
	}
}

func decodeBody(w http.ResponseWriter, r *http.Request, limit int64, into any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return false
		}
		writeError(w, http.StatusBadRequest, "malformed request body")
		return false
	}
	return true
}

// decodeFiles reads an optional {"files": {path: content}} body. No body at
// all is fine and yields nil; a body that's present but malformed or too
// large is refused.
func decodeFiles(w http.ResponseWriter, r *http.Request) (map[string]string, bool) {
	if r.ContentLength == 0 {
		return nil, true
	}
	var body struct {
		Files map[string]string `json:"files"`
	}
	if !decodeBody(w, r, maxWorkspaceBodyBytes, &body) {
		return nil, false
	}
	return body.Files, true
}

type conversationTurn struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

// handleAssistantHistory returns the session's assistant conversation so a
// reloaded workspace shows what was already said, plus whether a model is
// connected at all.
func (s *Server) handleAssistantHistory(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	turns, err := s.orc.AssistantHistory(r.Context(), sess.ID)
	if err != nil {
		slog.Error("handleAssistantHistory", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load the conversation")
		return
	}
	out := make([]conversationTurn, 0, len(turns))
	for _, t := range turns {
		out = append(out, conversationTurn{Role: t.Role, Text: t.Text})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"messages":   out,
		"configured": s.orc.Agents != nil && s.orc.Agents.Configured(),
	})
}

// handleAssistantAsk is the workspace assistant: one candidate message in,
// one reply out, both recorded as ai_usage evidence.
func (s *Server) handleAssistantAsk(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+")")
		return
	}

	var body struct {
		Message     string `json:"message"`
		FilePath    string `json:"filePath"`
		FileContent string `json:"fileContent"`
	}
	if !decodeBody(w, r, maxAssistantBodyBytes, &body) {
		return
	}
	message := strings.TrimSpace(body.Message)
	if message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}
	if len(message) > maxAssistantMessage {
		writeError(w, http.StatusBadRequest, "that message is too long")
		return
	}
	if len(body.FileContent) > maxAssistantFileBytes {
		body.FileContent = body.FileContent[:maxAssistantFileBytes] + "\n… (file truncated)"
	}

	reply, err := s.orc.AskAssistant(r.Context(), sess, message, body.FilePath, body.FileContent)
	if err != nil {
		aiError(w, "handleAssistantAsk", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"reply": reply})
}

// handleInterview advances the follow-up interview one step — see
// orchestrator.InterviewNext for the state machine. The first call of an
// interview carries the workspace files, recorded as a snapshot so the
// interviewer asks about what the candidate actually wrote.
func (s *Server) handleInterview(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+")")
		return
	}

	var body struct {
		Answer string `json:"answer"`
		// Skip records the waiting question as unanswered — sent when the
		// answer timer runs out with nothing typed or said.
		Skip  bool              `json:"skip"`
		Files map[string]string `json:"files"`
	}
	if r.ContentLength != 0 && !decodeBody(w, r, maxWorkspaceBodyBytes, &body) {
		return
	}
	if len(body.Answer) > maxInterviewAnswer {
		writeError(w, http.StatusBadRequest, "that answer is too long")
		return
	}
	if err := s.orc.RecordSnapshot(r.Context(), sess.ID, body.Files); err != nil {
		slog.Error("handleInterview: recording workspace", "session", sess.ID, "error", err)
	}

	state, err := s.orc.InterviewNext(r.Context(), sess, orchestrator.InterviewAnswer{Text: body.Answer, Skipped: body.Skip})
	if err != nil {
		aiError(w, "handleInterview", err)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// handleCheckpoint saves the workspace as it stands, replacing the previous
// checkpoint. The workspace sends one every couple of minutes while the
// candidate works, so that a session nobody submits still has its code on
// the server — see orchestrator.RecordCheckpoint.
func (s *Server) handleCheckpoint(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+")")
		return
	}
	files, ok := decodeFiles(w, r)
	if !ok {
		return
	}
	if err := s.orc.RecordCheckpoint(r.Context(), sess.ID, files); err != nil {
		slog.Error("handleCheckpoint", "session", sess.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "could not save the workspace")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAdminGenerateTask drafts a task brief and starter codebase for the
// Game Library's authoring form. It returns the draft and stores nothing:
// the author reads it, edits it, and saves it the same way as a hand-written
// one.
func (s *Server) handleAdminGenerateTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string   `json:"name"`
		TaskVariant string   `json:"taskVariant"`
		TechStack   []string `json:"techStack"`
		DurationMin int      `json:"durationMin"`
		Notes       string   `json:"notes"`
	}
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
	})
	if err != nil {
		slog.Error("handleAdminGenerateTask", "error", err)
		writeError(w, http.StatusBadGateway, "the model didn't return a usable task — try again")
		return
	}
	writeJSON(w, http.StatusOK, task)
}
