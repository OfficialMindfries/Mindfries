package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mindfries/candidate-backend/internal/orchestrator"
	"github.com/mindfries/candidate-backend/internal/session"
)

// The live voice interview's two endpoints. The candidate's page can't open
// a WebSocket to this backend with its cookie — the cookie belongs to
// candidate/frontend's origin — so it takes two steps:
//
//  1. candidate/frontend's server calls handleLiveInterviewStart with the
//     cookie, like every other request, and gets a ticket good for a minute.
//  2. The page opens a WebSocket to handleLiveInterviewCall and sends the
//     ticket as its first message. From there the socket carries microphone
//     audio one way and the interviewer's voice and captions the other.
//
// The ticket goes in a message rather than the URL so that it never lands in
// an access log.

const (
	liveTicketTTL = time.Minute
	// How long the page has to present its ticket after connecting.
	liveTicketWait = 10 * time.Second
	// Slack on top of the interview's own allowance before the call is cut:
	// connecting, and the sign-off.
	liveCallSlack = 2 * time.Minute
	// A chunk of microphone audio is a few kilobytes; nothing a page sends
	// here should come near this.
	liveMaxMessageBytes = 256 * 1024
)

// liveCalls allows one call per session at a time: a second tab, or a
// reconnect racing the call it replaces, would otherwise have two
// interviewers writing into one transcript.
var liveCalls sync.Map

type liveStartResponse struct {
	Ticket        string `json:"ticket"`
	Asked         int    `json:"asked"`
	Total         int    `json:"total"`
	Language      string `json:"language"`
	AnswerSeconds int    `json:"answerSeconds"`
	InputRate     int    `json:"inputRate"`
	OutputRate    int    `json:"outputRate"`
}

// handleLiveInterviewStart records the workspace (the first call of an
// interview carries it, exactly as the turn-based one does) and issues the
// ticket for the call. 503 means there is no live voice line and the page
// should hold the interview turn by turn.
func (s *Server) handleLiveInterviewStart(w http.ResponseWriter, r *http.Request) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+")")
		return
	}
	if !s.orc.Live.Configured() {
		notConfigured(w, "the live voice interviewer")
		return
	}
	files, ok := decodeFiles(w, r)
	if !ok {
		return
	}
	if err := s.orc.RecordSnapshot(r.Context(), sess.ID, files); err != nil {
		slog.Error("handleLiveInterviewStart: recording workspace", "session", sess.ID, "error", err)
	}

	cfg := s.db.GetInterviewConfig(r.Context(), sess.AssessmentID)
	ticket, err := session.SignLiveTicket(session.LiveTicket{
		SessionID: sess.ID, CandidateID: c.ID, Exp: time.Now().Add(liveTicketTTL).Unix(),
	}, s.cfg.CandidateSessionSecret)
	if err != nil {
		slog.Error("handleLiveInterviewStart: signing ticket", "error", err)
		writeError(w, http.StatusInternalServerError, "could not start the call")
		return
	}
	writeJSON(w, http.StatusOK, liveStartResponse{
		Ticket: ticket, Total: cfg.Questions, Language: cfg.Language, AnswerSeconds: cfg.AnswerSeconds,
		InputRate: 16000, OutputRate: 24000,
	})
}

// browserCall is the candidate's end of the call. gorilla allows one writer
// at a time, and audio and captions are written from the same loop but
// errors from another, so writes are serialised.
type browserCall struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (b *browserCall) write(messageType int, data []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return b.conn.WriteMessage(messageType, data)
}

func (b *browserCall) Audio(pcm []byte) error { return b.write(websocket.BinaryMessage, pcm) }

func (b *browserCall) Message(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return b.write(websocket.TextMessage, data)
}

// end tells the page how the call finished and closes it. "done" means the
// interview is complete; "fallback" means it isn't and the page should carry
// on turn by turn, which resumes from whatever was recorded.
func (b *browserCall) end(kind, reason string) {
	_ = b.Message(map[string]string{"type": kind, "reason": reason})
	b.mu.Lock()
	b.conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	b.mu.Unlock()
}

// handleLiveInterviewCall is the call itself.
func (s *Server) handleLiveInterviewCall(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
		// Same allowlist as CORS: a WebSocket handshake isn't covered by a
		// preflight, so the Origin is checked here.
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			return origin == "" || slices.Contains(s.cfg.AllowedOrigins, origin)
		},
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("handleLiveInterviewCall: upgrade refused", "error", err)
		return
	}
	defer conn.Close()
	conn.SetReadLimit(liveMaxMessageBytes)
	browser := &browserCall{conn: conn}

	// First message: the ticket.
	conn.SetReadDeadline(time.Now().Add(liveTicketWait))
	var hello struct {
		Ticket string `json:"ticket"`
	}
	if err := conn.ReadJSON(&hello); err != nil {
		return
	}
	ticket, err := session.VerifyLiveTicket(hello.Ticket, s.cfg.CandidateSessionSecret)
	if err != nil {
		browser.end("error", "This call's ticket is no longer valid.")
		return
	}
	conn.SetReadDeadline(time.Time{})

	ctx := r.Context()
	sess, err := s.db.GetSession(ctx, ticket.SessionID)
	if err != nil || sess.CandidateID == nil || *sess.CandidateID != ticket.CandidateID || !sessionIsLive(sess.Status) {
		browser.end("error", "This session is no longer active.")
		return
	}
	if _, busy := liveCalls.LoadOrStore(sess.ID, struct{}{}); busy {
		browser.end("error", "This interview is already in a call.")
		return
	}
	defer liveCalls.Delete(sess.ID)

	plan, err := s.orc.PlanLiveInterview(ctx, sess)
	if err != nil {
		slog.Error("handleLiveInterviewCall: planning", "session", sess.ID, "error", err)
		browser.end("fallback", "The interview could not be prepared.")
		return
	}
	if plan.Done {
		browser.end("done", "")
		return
	}

	budget := time.Duration(plan.Config.Questions)*time.Duration(plan.Config.AnswerSeconds+60)*time.Second + liveCallSlack
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()

	model, err := s.orc.Live.Connect(ctx, plan.Prompt)
	if err != nil {
		slog.Error("handleLiveInterviewCall: connecting to the live model", "session", sess.ID, "error", err)
		browser.end("fallback", "The voice line could not be opened.")
		return
	}
	defer model.Close()

	// The microphone, upstream. This goroutine is also what notices the page
	// going away, which cancels the call.
	go func() {
		defer cancel()
		for {
			kind, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if kind != websocket.BinaryMessage {
				continue
			}
			if err := model.SendAudio(data); err != nil {
				return
			}
		}
	}()

	_ = browser.Message(map[string]any{"type": "ready", "asked": plan.Asked, "total": plan.Config.Questions})
	slog.Info("live interview: call started", "session", sess.ID, "model", s.orc.Live.Model(), "asked", plan.Asked)

	err = s.orc.RunLiveInterview(ctx, sess, plan, s.orc.Live.Model(), model, browser)
	switch {
	case err == nil:
		slog.Info("live interview: complete", "session", sess.ID)
		browser.end("done", "")
	case errors.Is(err, context.Canceled):
		slog.Info("live interview: the candidate's page left the call", "session", sess.ID)
	default:
		slog.Error("live interview: call failed", "session", sess.ID, "error", err)
		reason := "The voice line dropped."
		if errors.Is(err, orchestrator.ErrLiveStalled) {
			reason = "The interviewer stopped responding."
		}
		browser.end("fallback", reason)
	}
}
