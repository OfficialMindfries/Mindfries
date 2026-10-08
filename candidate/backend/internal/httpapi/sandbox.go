package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/orchestrator"
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
	// How long a preview link to a port in the sandbox works.
	previewLinkSec = 60 * 60
	// Terminals open at once for one session — a couple of split panes, not
	// an unbounded number of shells.
	maxTerminalsPerSession = 4
	// How much of a command's output — its end — is kept when it finishes:
	// test results are read out of it here, and the page shows it.
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
	s.orc.RecordTestRun(r.Context(), sess.ID, command, res.Output, res.ExitCode)
	output, truncated := res.Output, false
	if len(output) > sandboxOutputCap {
		output, truncated = output[len(output)-sandboxOutputCap:], true
	}
	writeJSON(w, http.StatusOK, map[string]any{"exitCode": res.ExitCode, "output": output, "truncated": truncated, "ms": took.Milliseconds()})
}

// handleSandboxPorts lists what is listening in the sandbox — the servers
// the candidate has started.
func (s *Server) handleSandboxPorts(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, false)
	if !ok {
		return
	}
	ports, err := ws.Ports(r.Context())
	if err != nil {
		sandboxError(w, "handleSandboxPorts", sess, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ports": ports})
}

// handleSandboxPreview returns a link to one of those ports. The link is
// the candidate's way to open what they are building in a browser tab; it
// expires, and reaches only that port.
func (s *Server) handleSandboxPreview(w http.ResponseWriter, r *http.Request) {
	sess, ws, ok := s.sandboxFor(w, r, false)
	if !ok {
		return
	}
	var body struct {
		Port int `json:"port"`
	}
	if !decodeBody(w, r, 1024, &body) {
		return
	}
	// Not the low ports, and not Daytona's own daemon.
	if body.Port < 1024 || body.Port > 65535 || body.Port == 2280 || body.Port == 22220 || body.Port == 22222 || body.Port == 33333 {
		writeError(w, http.StatusBadRequest, "that port can't be previewed")
		return
	}
	link, err := s.orc.Sandbox.PreviewURL(r.Context(), ws.SandboxID, body.Port, previewLinkSec)
	if err != nil {
		sandboxError(w, "handleSandboxPreview", sess, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": link, "expiresInSec": previewLinkSec})
}

// ── Terminal tickets (the terminal itself is terminals.go) ─────────────────

// spentTerminalTickets makes a terminal ticket good for one connection. A
// ticket is valid for a minute so that a slow page can still present it;
// without this, anything that saw it in that minute could open a second
// shell with it. Kept in memory: with more than one instance of this
// backend a ticket could be spent once per instance, which is still bounded
// by the minute and by the per-session terminal limit.
var spentTerminalTickets sync.Map // ticket → expiry (unix seconds)

func spendTerminalTicket(ticket string, exp int64) bool {
	now := time.Now().Unix()
	spentTerminalTickets.Range(func(k, v any) bool {
		if v.(int64) < now {
			spentTerminalTickets.Delete(k)
		}
		return true
	})
	_, already := spentTerminalTickets.LoadOrStore(ticket, exp)
	return !already
}

func (s *Server) handleTerminalTicket(w http.ResponseWriter, r *http.Request) {
	sess, _, ok := s.sandboxFor(w, r, true)
	if !ok {
		return
	}
	nonce := make([]byte, 9)
	_, _ = rand.Read(nonce)
	ticket, err := session.SignTerminalTicket(session.LiveTicket{
		SessionID: sess.ID, CandidateID: candidateFrom(r).ID, Exp: time.Now().Add(terminalTicketTTL).Unix(),
		Nonce: hex.EncodeToString(nonce),
	}, s.cfg.CandidateSessionSecret)
	if err != nil {
		slog.Error("handleTerminalTicket: signing ticket", "error", err)
		writeError(w, http.StatusInternalServerError, "could not open the terminal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ticket": ticket})
}
