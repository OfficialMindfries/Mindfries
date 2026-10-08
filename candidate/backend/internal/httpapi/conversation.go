package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/orchestrator"
)

// Limits on what a candidate's browser can send the AI endpoints. The model
// is the expensive part, so these bound what reaches it as well as what
// reaches the database.
const (
	maxAssistantBodyBytes = 1024 * 1024 // the message, plus the project it's asked about
	maxAssistantTerminal  = 16 * 1024
	maxAssistantMessage   = 4000
	maxAssistantFileBytes = 20 * 1024
	maxWorkspaceBodyBytes = 1024 * 1024
	maxInterviewAnswer    = 6000
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
	case errors.Is(err, orchestrator.ErrAssistantOff):
		writeError(w, http.StatusForbidden, "the assistant is switched off for this assessment")
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
// reloaded workspace shows what was already said, plus what the candidate
// can still do with it: whether a model is connected at all, whether the
// hiring company left the assistant on for this role, and how many messages
// are left.
func (s *Server) handleAssistantHistory(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	state, err := s.orc.AssistantHistory(r.Context(), sess)
	if err != nil {
		slog.Error("handleAssistantHistory", "error", err)
		writeError(w, http.StatusInternalServerError, "could not load the conversation")
		return
	}
	out := make([]conversationTurn, 0, len(state.Turns))
	for _, t := range state.Turns {
		out = append(out, conversationTurn{Role: t.Role, Text: t.Text})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"messages":   out,
		"configured": s.orc.Agents != nil && s.orc.Agents.Configured(),
		"enabled":    state.Enabled,
		"limit":      state.Limit,
		"used":       state.Used,
	})
}

// assistantRequest reads and checks one message to the assistant. It writes
// the error response itself when the request can't be used.
func (s *Server) assistantRequest(w http.ResponseWriter, r *http.Request) (db.Session, orchestrator.AssistantQuestion, bool) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return sess, orchestrator.AssistantQuestion{}, false
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+")")
		return sess, orchestrator.AssistantQuestion{}, false
	}

	var body struct {
		Message     string `json:"message"`
		FilePath    string `json:"filePath"`
		FileContent string `json:"fileContent"`
		// The rest of the project and the terminal's recent output, so the
		// assistant can be asked about more than the one file on screen.
		Files    map[string]string `json:"files"`
		Terminal string            `json:"terminal"`
	}
	if !decodeBody(w, r, maxAssistantBodyBytes, &body) {
		return sess, orchestrator.AssistantQuestion{}, false
	}
	message := strings.TrimSpace(body.Message)
	if message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return sess, orchestrator.AssistantQuestion{}, false
	}
	if len(message) > maxAssistantMessage {
		writeError(w, http.StatusBadRequest, "that message is too long")
		return sess, orchestrator.AssistantQuestion{}, false
	}
	if len(body.FileContent) > maxAssistantFileBytes {
		body.FileContent = body.FileContent[:maxAssistantFileBytes] + "\n… (file truncated)"
	}
	if len(body.Terminal) > maxAssistantTerminal {
		body.Terminal = body.Terminal[len(body.Terminal)-maxAssistantTerminal:]
	}
	return sess, orchestrator.AssistantQuestion{
		Message: message, FilePath: body.FilePath, FileContent: body.FileContent,
		Files: body.Files, Terminal: body.Terminal,
	}, true
}

// handleAssistantAsk is the workspace assistant: one candidate message in,
// one reply out, both recorded as ai_usage evidence.
func (s *Server) handleAssistantAsk(w http.ResponseWriter, r *http.Request) {
	sess, question, ok := s.assistantRequest(w, r)
	if !ok {
		return
	}
	reply, err := s.orc.AskAssistant(r.Context(), sess, question, nil)
	if err != nil {
		aiError(w, "handleAssistantAsk", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"reply": reply})
}

// handleAssistantStream is handleAssistantAsk with the reply sent as it is
// written, as server-sent events: "delta" for each piece of text, then
// "done" carrying the whole reply as it was recorded.
//
// The response only becomes a stream once there is something to stream. A
// request that is refused outright — the assistant is off, the limit is
// reached, the model can't be called — gets the same plain JSON error as
// the non-streaming endpoint, with a real status code.
func (s *Server) handleAssistantStream(w http.ResponseWriter, r *http.Request) {
	sess, question, ok := s.assistantRequest(w, r)
	if !ok {
		return
	}
	flusher, canFlush := w.(http.Flusher)
	if !canFlush {
		writeError(w, http.StatusInternalServerError, "streaming isn't available on this connection")
		return
	}

	streaming := false
	send := func(event string, payload any) {
		if !streaming {
			streaming = true
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache, no-transform")
			// Tells an intermediate proxy not to hold the pieces back until
			// it has a buffer's worth.
			w.Header().Set("X-Accel-Buffering", "no")
			w.WriteHeader(http.StatusOK)
		}
		data, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
		flusher.Flush()
	}

	reply, err := s.orc.AskAssistant(r.Context(), sess, question, func(piece string) {
		send("delta", map[string]string{"text": piece})
	})
	switch {
	case err == nil:
		send("done", map[string]string{"reply": reply})
	case !streaming:
		aiError(w, "handleAssistantStream", err)
	default:
		// Text has already gone out, so the status can't change now.
		slog.Error("handleAssistantStream: failed after the reply began", "session", sess.ID, "error", err)
		send("error", map[string]string{"error": "the reply was cut off and has not been recorded — ask again"})
	}
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
	if err := s.orc.CaptureWorkspace(r.Context(), sess, body.Files, false); err != nil {
		slog.Error("handleInterview: recording workspace", "session", sess.ID, "error", err)
	}

	state, err := s.orc.InterviewNext(r.Context(), sess, orchestrator.InterviewAnswer{Text: body.Answer, Skipped: body.Skip})
	if err != nil {
		aiError(w, "handleInterview", err)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// checkpointGrace is how long after the session's time runs out a
// checkpoint is still taken: the last one may already be on its way.
const checkpointGrace = 90 * time.Second

// handleGetWorkspace returns the latest copy of the session's files the
// server holds, so the workspace can be restored in a browser that doesn't
// have it — a different device, or this one after its storage was cleared.
// 204 when nothing has been saved yet.
func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	saved, err := s.orc.Workspace(r.Context(), sess.ID)
	if err != nil {
		slog.Error("handleGetWorkspace", "session", sess.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "could not load the saved workspace")
		return
	}
	if saved == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, saved)
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
	// The clock is the server's. Once the session's time is up the work is
	// what it was; a checkpoint arriving later — a tab left open, or a
	// request replayed — doesn't get to change it. (The submit that follows
	// time-up carries the final files itself and isn't subject to this.)
	if time.Since(sess.StartedAt) > time.Duration(sess.DurationMin)*time.Minute+checkpointGrace {
		writeError(w, http.StatusConflict, "this session's time is up")
		return
	}
	files, ok := decodeFiles(w, r)
	if !ok {
		return
	}
	if err := s.orc.CaptureWorkspace(r.Context(), sess, files, true); err != nil {
		slog.Error("handleCheckpoint", "session", sess.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "could not save the workspace")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
