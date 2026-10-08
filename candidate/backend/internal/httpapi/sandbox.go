package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/orchestrator"
	"github.com/mindfries/candidate-backend/internal/sandbox"
	"github.com/mindfries/candidate-backend/internal/session"
	"github.com/mindfries/candidate-backend/internal/workspace"
)

// The sandbox workspace's endpoints: the project's files, a command run to
// completion (the Tests panel), and the terminal.
//
// Every one of them is the session's own candidate acting on the session's
// own sandbox, while the session is live and inside its time. The file
// routes only ever touch the project directory (workspace.Rel). Once the
// interview has begun the work is frozen: reads still work, anything that
// would change a file is refused.

const (
	sandboxRunDefaultSec = 120
	sandboxRunMaxSec     = 300
	sandboxOutputCap     = 256 * 1024
	terminalTicketTTL    = time.Minute
	// Terminals open at once for one session — a couple of split panes, not
	// an unbounded number of shells.
	maxTerminalsPerSession = 4
	// How much of a command's output is kept to hand to the page when it
	// finishes (the page reads test results out of it).
	commandOutputCap = 64 * 1024
)

// sandboxFor resolves the request to a usable sandbox workspace, or writes
// the refusal. `changing` is true for a request that would alter the work.
func (s *Server) sandboxFor(w http.ResponseWriter, r *http.Request, changing bool) (db.Session, workspace.Workspace, bool) {
	c := candidateFrom(r)
	sess, ok := s.ownsSession(w, r, r.PathValue("id"), c.ID)
	if !ok {
		return sess, workspace.Workspace{}, false
	}
	if !sessionIsLive(sess.Status) {
		writeError(w, http.StatusConflict, "this session is no longer active ("+sess.Status+")")
		return sess, workspace.Workspace{}, false
	}
	if changing {
		if time.Since(sess.StartedAt) > time.Duration(sess.DurationMin)*time.Minute+checkpointGrace {
			writeError(w, http.StatusConflict, "this session's time is up")
			return sess, workspace.Workspace{}, false
		}
		if s.orc.WorkFrozen(r.Context(), sess.ID) {
			writeError(w, http.StatusConflict, "the interview has begun; the work can no longer change")
			return sess, workspace.Workspace{}, false
		}
	}
	ws, err := s.orc.SandboxWorkspace(r.Context(), sess)
	if errors.Is(err, orchestrator.ErrNoSandbox) {
		writeError(w, http.StatusNotFound, "this session's workspace runs in the browser")
		return sess, workspace.Workspace{}, false
	}
	if err != nil {
		slog.Error("sandboxFor: sandbox not reachable", "session", sess.ID, "error", err)
		writeError(w, http.StatusBadGateway, "the sandbox isn't responding — try again in a moment")
		return sess, workspace.Workspace{}, false
	}
	return sess, ws, true
}

func sandboxError(w http.ResponseWriter, where string, sess db.Session, err error) {
	if errors.Is(err, workspace.ErrBadPath) {
		writeError(w, http.StatusBadRequest, "that path is outside the project")
		return
	}
	slog.Error(where, "session", sess.ID, "error", err)
	writeError(w, http.StatusBadGateway, "the sandbox didn't complete that — try again in a moment")
}

// handleSandboxFiles lists the project's files (no contents).
func (s *Server) handleSandboxFiles(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, false)
	if !ok {
		return
	}
	entries, truncated, err := ws.Manifest(r.Context())
	if err != nil {
		sandboxError(w, "handleSandboxFiles", sess, err)
		return
	}
	if entries == nil {
		entries = []workspace.Entry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "truncated": truncated})
}

// handleSandboxRead returns the contents of the named files.
func (s *Server) handleSandboxRead(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, false)
	if !ok {
		return
	}
	var body struct {
		Paths []string `json:"paths"`
	}
	if !decodeBody(w, r, 256*1024, &body) {
		return
	}
	if len(body.Paths) > workspace.MaxFiles {
		writeError(w, http.StatusBadRequest, "too many files asked for at once")
		return
	}
	files, err := ws.Read(r.Context(), body.Paths)
	if err != nil {
		sandboxError(w, "handleSandboxRead", sess, err)
		return
	}
	if files == nil {
		files = []workspace.File{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": files})
}

// handleSandboxWrite saves one file.
func (s *Server) handleSandboxWrite(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, true)
	if !ok {
		return
	}
	var body struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if !decodeBody(w, r, workspace.MaxFileBytes+64*1024, &body) {
		return
	}
	if err := ws.Write(r.Context(), body.Path, body.Content); err != nil {
		sandboxError(w, "handleSandboxWrite", sess, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleSandboxChange is the three structural edits the explorer makes:
// delete, move (rename), and make a directory.
func (s *Server) handleSandboxChange(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, true)
	if !ok {
		return
	}
	var body struct {
		Op   string `json:"op"`
		Path string `json:"path"`
		To   string `json:"to"`
	}
	if !decodeBody(w, r, 16*1024, &body) {
		return
	}
	var err error
	switch body.Op {
	case "delete":
		err = ws.Delete(r.Context(), body.Path)
	case "move":
		err = ws.Move(r.Context(), body.Path, body.To)
	case "mkdir":
		err = ws.MakeDir(r.Context(), body.Path)
	default:
		writeError(w, http.StatusBadRequest, "unknown change")
		return
	}
	if err != nil {
		sandboxError(w, "handleSandboxChange", sess, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleSandboxRun runs a command in the project and waits for it — what
// the Tests panel uses. It is the candidate's own sandbox, so the command
// is whatever they ask; what is bounded is how long it may take and how
// much output comes back.
func (s *Server) handleSandboxRun(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, true)
	if !ok {
		return
	}
	var body struct {
		Command    string `json:"command"`
		TimeoutSec int    `json:"timeoutSec"`
	}
	if !decodeBody(w, r, 16*1024, &body) {
		return
	}
	command := strings.TrimSpace(body.Command)
	if command == "" || len(command) > 2000 {
		writeError(w, http.StatusBadRequest, "give a command to run")
		return
	}
	timeout := body.TimeoutSec
	if timeout <= 0 {
		timeout = sandboxRunDefaultSec
	}
	timeout = min(timeout, sandboxRunMaxSec)

	started := time.Now()
	res, err := ws.Run(r.Context(), command+" 2>&1", timeout)
	if err != nil {
		sandboxError(w, "handleSandboxRun", sess, err)
		return
	}
	took := time.Since(started)
	s.orc.RecordTerminalCommand(r.Context(), sess.ID, command, res.ExitCode, took)
	output, truncated := res.Output, false
	if len(output) > sandboxOutputCap {
		output, truncated = output[len(output)-sandboxOutputCap:], true
	}
	writeJSON(w, http.StatusOK, map[string]any{"exitCode": res.ExitCode, "output": output, "truncated": truncated, "ms": took.Milliseconds()})
}

// ── Terminal ────────────────────────────────────────────────────────────────
//
// The page can't open a WebSocket here with its cookie (it belongs to
// candidate/frontend's origin), so — as with the voice interview and the
// event stream — candidate/frontend's server asks for a ticket, and the
// page presents it as the socket's first message.
//
// After that the socket is the terminal:
//
//	page → here    binary: keystrokes.  text: {"type":"resize","cols":…,"rows":…}
//	here → page    binary: output.      text: {"type":"ready"} once the shell is up,
//	                                          {"type":"command","command":…,"exitCode":…,"ms":…,"output":…}
//	                                          each time a command finishes,
//	                                          {"type":"closed","reason":…} before hanging up
//
// The shell reports its own commands inside its output (workspace/seed.go);
// those reports are taken out here, recorded, and passed on as "command"
// messages — which is also the page's cue that files may have changed.

var terminalCounts sync.Map // session id → *atomic.Int32

func (s *Server) handleTerminalTicket(w http.ResponseWriter, r *http.Request) {
	sess, _, ok := s.sandboxFor(w, r, true)
	if !ok {
		return
	}
	ticket, err := session.SignTerminalTicket(session.LiveTicket{
		SessionID: sess.ID, CandidateID: candidateFrom(r).ID, Exp: time.Now().Add(terminalTicketTTL).Unix(),
	}, s.cfg.CandidateSessionSecret)
	if err != nil {
		slog.Error("handleTerminalTicket: signing ticket", "error", err)
		writeError(w, http.StatusInternalServerError, "could not open the terminal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ticket": ticket})
}

func (s *Server) handleTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := s.hub.Upgrade(w, r)
	if err != nil {
		slog.Warn("handleTerminal: upgrade refused", "error", err)
		return
	}
	defer conn.Close()

	var writeMu sync.Mutex
	sendJSON := func(v any) {
		writeMu.Lock()
		defer writeMu.Unlock()
		conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		_ = conn.WriteJSON(v)
	}
	closed := func(reason string) { sendJSON(map[string]string{"type": "closed", "reason": reason}) }

	conn.SetReadLimit(64 * 1024)
	conn.SetReadDeadline(time.Now().Add(liveTicketWait))
	var hello struct {
		Ticket string `json:"ticket"`
		Cols   int    `json:"cols"`
		Rows   int    `json:"rows"`
	}
	if err := conn.ReadJSON(&hello); err != nil {
		return
	}
	ticket, err := session.VerifyTerminalTicket(hello.Ticket, s.cfg.CandidateSessionSecret)
	if err != nil {
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	sess, err := s.db.GetSession(ctx, ticket.SessionID)
	if err != nil || sess.CandidateID == nil || *sess.CandidateID != ticket.CandidateID || !sessionIsLive(sess.Status) {
		return
	}
	if s.orc.WorkFrozen(ctx, sess.ID) {
		closed("The interview has begun, so the terminal is closed.")
		return
	}
	// The session's clock closes the terminal when it runs out.
	deadline := sess.StartedAt.Add(time.Duration(sess.DurationMin)*time.Minute + checkpointGrace)
	if !time.Now().Before(deadline) {
		closed("This session's time is up.")
		return
	}

	counter, _ := terminalCounts.LoadOrStore(sess.ID, new(atomic.Int32))
	open := counter.(*atomic.Int32)
	if open.Add(1) > maxTerminalsPerSession {
		open.Add(-1)
		closed("Too many terminals are open for this session. Close one and try again.")
		return
	}
	defer open.Add(-1)

	ws, err := s.orc.SandboxWorkspace(ctx, sess)
	if err != nil {
		closed("The sandbox isn't responding. Try again in a moment.")
		return
	}
	cols, rows := clamp(hello.Cols, 20, 400, 120), clamp(hello.Rows, 5, 200, 30)
	id := make([]byte, 6)
	_, _ = rand.Read(id)
	pty, err := s.orc.Sandbox.OpenPTY(ctx, ws.SandboxID, sandbox.PTYOptions{
		ID: "t-" + hex.EncodeToString(id), Cwd: "/home/daytona/" + workspace.Dir, Cols: cols, Rows: rows,
		Envs: map[string]string{"TERM": "xterm-256color", "LANG": "C.UTF-8"},
	})
	if err != nil {
		slog.Error("handleTerminal: opening a terminal", "session", sess.ID, "error", err)
		closed("The terminal couldn't be opened. Try again in a moment.")
		return
	}
	defer pty.Close()
	sendJSON(map[string]string{"type": "ready"})

	// Sandbox → page.
	done := make(chan struct{})
	go func() {
		defer close(done)
		var filter workspace.MarkerFilter
		var running string
		var startedAt time.Time
		var captured []byte
		for {
			chunk, err := pty.Read()
			if err != nil {
				return
			}
			out, markers := filter.Feed(chunk)
			if len(out) > 0 {
				if running != "" && len(captured) < commandOutputCap {
					captured = append(captured, out[:min(len(out), commandOutputCap-len(captured))]...)
				}
				writeMu.Lock()
				conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
				werr := conn.WriteMessage(websocket.BinaryMessage, out)
				writeMu.Unlock()
				if werr != nil {
					return
				}
			}
			for _, m := range markers {
				if m.Command != "" {
					running, startedAt, captured = m.Command, time.Now(), captured[:0]
					continue
				}
				if running == "" || m.Exit == nil {
					continue // a prompt redrawn with nothing run
				}
				took := time.Since(startedAt)
				// Not ctx: the command happened whether or not the page is still here.
				s.orc.RecordTerminalCommand(context.WithoutCancel(ctx), sess.ID, running, *m.Exit, took)
				sendJSON(map[string]any{"type": "command", "command": running, "exitCode": *m.Exit, "ms": took.Milliseconds(), "output": string(captured)})
				running = ""
			}
		}
	}()

	// Page → sandbox.
	go func() {
		defer cancel()
		for {
			conn.SetReadDeadline(deadline)
			kind, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if kind == websocket.BinaryMessage {
				if pty.Write(data) != nil {
					return
				}
				continue
			}
			var control struct {
				Type string `json:"type"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
			}
			if json.Unmarshal(data, &control) == nil && control.Type == "resize" {
				_ = pty.Resize(ctx, clamp(control.Cols, 20, 400, cols), clamp(control.Rows, 5, 200, rows))
			}
		}
	}()

	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	select {
	case <-done:
		closed("The shell exited.")
	case <-ctx.Done():
	case <-timer.C:
		closed("This session's time is up.")
	}
}

func clamp(v, lo, hi, fallback int) int {
	if v < lo || v > hi {
		return fallback
	}
	return v
}
