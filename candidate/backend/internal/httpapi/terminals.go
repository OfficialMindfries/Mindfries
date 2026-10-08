package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/sandbox"
	"github.com/mindfries/candidate-backend/internal/session"
	"github.com/mindfries/candidate-backend/internal/workspace"
)

// The sandbox terminal.
//
// The page can't open a WebSocket here with its cookie (it belongs to
// candidate/frontend's origin), so — as with the voice interview and the
// event stream — candidate/frontend's server asks for a ticket, and the
// page presents it as the socket's first message:
//
//	{"ticket":…, "cols":…, "rows":…}                       a new shell
//	{"ticket":…, "cols":…, "rows":…, "terminal":…, "seen":…}  back to one it had
//
// After that the socket is the terminal:
//
//	page → here    binary: keystrokes.  text: {"type":"resize","cols":…,"rows":…}
//	here → page    binary: output.      text: {"type":"ready","terminal":…,"resumed":…,"offset":…}
//	                                          once the shell is attached,
//	                                          {"type":"command","command":…,"exitCode":…,"ms":…,"output":…}
//	                                          each time a command finishes,
//	                                          {"type":"closed","reason":…} before hanging up
//
// The shell reports its own commands inside its output (workspace/seed.go);
// those reports are taken out here, recorded, and passed on as "command"
// messages — which is also the page's cue that files may have changed.
//
// A shell belongs to the session, not to the socket. When the page's
// connection drops — poor wifi, a closed laptop lid, a reload — the shell
// and whatever is running in it carry on, its output is kept, and commands
// that finish are still recorded. The page comes back with the terminal's
// id and how many bytes of output it had already drawn, and is sent the
// rest. A shell nobody returns to is closed after terminalGrace.
//
// The shells are held in this process's memory, so a restart of this
// backend ends them; the page is told its earlier shell is gone and gets a
// new one. The sandbox and its files are unaffected either way.

const (
	// How long a shell is kept with nobody attached to it.
	terminalGrace = 5 * time.Minute
	// How much recent output is kept for a page that comes back.
	terminalBacklogCap = 512 * 1024
)

// liveTerminal is one shell in a session's sandbox and whoever is watching it.
type liveTerminal struct {
	id        string
	sessionID string
	pty       *sandbox.PTY
	deadline  time.Time
	cancel    context.CancelFunc

	// Guards everything below, and orders what is written to the page:
	// output and the messages around it go out in the order they happened.
	mu       sync.Mutex
	conn     *websocket.Conn // nil while nobody is attached
	backlog  []byte          // the most recent output
	total    int64           // bytes of output ever produced; the backlog is its tail
	detached time.Time       // when the page left; zero while attached
	grace    *time.Timer
	ended    bool

	ptyMu sync.Mutex // one writer at a time to the shell
}

// terminals is every live shell, by session.
var terminals = struct {
	mu        sync.Mutex
	bySession map[string][]*liveTerminal
}{bySession: map[string][]*liveTerminal{}}

func findTerminal(sessionID, id string) *liveTerminal {
	terminals.mu.Lock()
	defer terminals.mu.Unlock()
	for _, t := range terminals.bySession[sessionID] {
		if t.id == id {
			return t
		}
	}
	return nil
}

// makeRoomForTerminal reports whether the session may open another shell.
// At the limit, the shell that has been left unattended longest is closed
// to make room — a page that was reloaded a few times shouldn't be locked
// out by the shells its earlier selves left behind.
func makeRoomForTerminal(sessionID string) bool {
	terminals.mu.Lock()
	list := terminals.bySession[sessionID]
	if len(list) < maxTerminalsPerSession {
		terminals.mu.Unlock()
		return true
	}
	var oldest *liveTerminal
	var since time.Time
	for _, t := range list {
		t.mu.Lock()
		if !t.detached.IsZero() && (oldest == nil || t.detached.Before(since)) {
			oldest, since = t, t.detached
		}
		t.mu.Unlock()
	}
	terminals.mu.Unlock()
	if oldest == nil {
		return false
	}
	oldest.end("")
	return true
}

func (t *liveTerminal) register() {
	terminals.mu.Lock()
	terminals.bySession[t.sessionID] = append(terminals.bySession[t.sessionID], t)
	terminals.mu.Unlock()
}

func (t *liveTerminal) unregister() {
	terminals.mu.Lock()
	defer terminals.mu.Unlock()
	list := terminals.bySession[t.sessionID]
	for i, other := range list {
		if other == t {
			list = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(list) == 0 {
		delete(terminals.bySession, t.sessionID)
	} else {
		terminals.bySession[t.sessionID] = list
	}
}

// writeLocked sends one frame to the attached page. A page that can't be
// written to is treated as gone: the shell stays, the page can come back.
// Callers hold t.mu.
func (t *liveTerminal) writeLocked(kind int, data []byte) {
	if t.conn == nil {
		return
	}
	t.conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	if err := t.conn.WriteMessage(kind, data); err != nil {
		t.detachLocked(t.conn)
	}
}

func (t *liveTerminal) sendLocked(v any) {
	if b, err := json.Marshal(v); err == nil {
		t.writeLocked(websocket.TextMessage, b)
	}
}

// output keeps a chunk of the shell's output and passes it to the page.
func (t *liveTerminal) output(chunk []byte) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.total += int64(len(chunk))
	t.backlog = append(t.backlog, chunk...)
	if len(t.backlog) > 2*terminalBacklogCap {
		t.backlog = append([]byte(nil), t.backlog[len(t.backlog)-terminalBacklogCap:]...)
	}
	t.writeLocked(websocket.BinaryMessage, chunk)
}

func (t *liveTerminal) send(v any) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.sendLocked(v)
}

// attach makes conn the page watching this shell and sends it whatever it
// hasn't drawn yet: everything after `seen`, as far back as is still kept.
// A page already attached is told why it is being replaced.
func (t *liveTerminal) attach(conn *websocket.Conn, seen int64, resumed bool) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.ended {
		return false
	}
	if t.conn != nil && t.conn != conn {
		old := t.conn
		t.sendLocked(map[string]string{"type": "closed", "reason": "This terminal was opened in another window."})
		_ = old.Close()
	}
	t.conn, t.detached = conn, time.Time{}
	if t.grace != nil {
		t.grace.Stop()
		t.grace = nil
	}
	kept := t.total - int64(len(t.backlog))
	from := min(max(seen, kept), t.total)
	t.sendLocked(map[string]any{"type": "ready", "terminal": t.id, "resumed": resumed, "offset": from})
	if rest := t.backlog[from-kept:]; len(rest) > 0 {
		t.writeLocked(websocket.BinaryMessage, rest)
	}
	return t.conn == conn
}

// detach is the page leaving. The shell is kept for terminalGrace.
func (t *liveTerminal) detach(conn *websocket.Conn) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.detachLocked(conn)
}

func (t *liveTerminal) detachLocked(conn *websocket.Conn) {
	if t.conn != conn || t.ended {
		return
	}
	_ = t.conn.Close()
	t.conn, t.detached = nil, time.Now()
	t.grace = time.AfterFunc(terminalGrace, func() {
		t.mu.Lock()
		unattended := t.conn == nil && !t.ended
		t.mu.Unlock()
		if unattended {
			t.end("")
		}
	})
}

// end closes the shell for good, telling the page why if one is attached.
func (t *liveTerminal) end(reason string) {
	t.mu.Lock()
	if t.ended {
		t.mu.Unlock()
		return
	}
	t.ended = true
	if t.grace != nil {
		t.grace.Stop()
	}
	if t.conn != nil {
		if reason != "" {
			t.sendLocked(map[string]string{"type": "closed", "reason": reason})
		}
		if t.conn != nil {
			_ = t.conn.Close()
			t.conn = nil
		}
	}
	t.mu.Unlock()
	t.cancel()
	t.unregister()
	t.pty.Close()
}

func (t *liveTerminal) write(data []byte) error {
	t.ptyMu.Lock()
	defer t.ptyMu.Unlock()
	return t.pty.Write(data)
}

// pump reads the shell until it ends: output goes to the backlog and the
// page, and each finished command is recorded — whether or not a page is
// attached to see it.
func (s *Server) pump(ctx context.Context, t *liveTerminal) {
	var filter workspace.MarkerFilter
	var running string
	var startedAt time.Time
	var captured []byte
	for {
		chunk, err := t.pty.Read()
		if err != nil {
			t.end("The shell exited.")
			return
		}
		out, markers := filter.Feed(chunk)
		if len(out) > 0 {
			if running != "" {
				// The end of a long run is what says how it went, so that
				// is the part kept.
				captured = append(captured, out...)
				if len(captured) > 2*commandOutputCap {
					captured = append([]byte(nil), captured[len(captured)-commandOutputCap:]...)
				}
			}
			t.output(out)
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
			if len(captured) > commandOutputCap {
				captured = captured[len(captured)-commandOutputCap:]
			}
			output := string(captured)
			s.orc.RecordTerminalCommand(ctx, t.sessionID, running, *m.Exit, took)
			s.orc.RecordTestRun(ctx, t.sessionID, running, output, *m.Exit)
			t.send(map[string]any{"type": "command", "command": running, "exitCode": *m.Exit, "ms": took.Milliseconds(), "output": output})
			running = ""
		}
	}
}

// openTerminal starts a new shell in the session's sandbox.
func (s *Server) openTerminal(ctx context.Context, sess db.Session, cols, rows int, deadline time.Time) (*liveTerminal, string) {
	if !makeRoomForTerminal(sess.ID) {
		return nil, "Too many terminals are open for this session. Close one and try again."
	}
	ws, err := s.orc.SandboxWorkspace(ctx, sess)
	if err != nil {
		return nil, "The sandbox isn't responding. Try again in a moment."
	}
	id := make([]byte, 6)
	_, _ = rand.Read(id)
	pty, err := s.orc.Sandbox.OpenPTY(ctx, ws.SandboxID, sandbox.PTYOptions{
		ID: "t-" + hex.EncodeToString(id), Cwd: "/home/daytona/" + workspace.Dir, Cols: cols, Rows: rows,
		Envs: map[string]string{"TERM": "xterm-256color", "LANG": "C.UTF-8"},
	})
	if err != nil {
		slog.Error("openTerminal: opening a terminal", "session", sess.ID, "error", err)
		return nil, "The terminal couldn't be opened. Try again in a moment."
	}
	// The shell outlives the request that opened it, so nothing it does is
	// tied to that request's context; the session's clock ends it instead.
	life, cancel := context.WithDeadline(context.Background(), deadline)
	t := &liveTerminal{id: "t-" + hex.EncodeToString(id), sessionID: sess.ID, pty: pty, deadline: deadline, cancel: cancel}
	t.register()
	go s.pump(context.WithoutCancel(life), t)
	go func() {
		<-life.Done()
		if time.Now().Before(deadline) {
			return // ended for another reason
		}
		t.end("This session's time is up.")
	}()
	return t, ""
}

func (s *Server) handleTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := s.hub.Upgrade(w, r)
	if err != nil {
		slog.Warn("handleTerminal: upgrade refused", "error", err)
		return
	}
	defer conn.Close()

	closed := func(reason string) {
		conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		_ = conn.WriteJSON(map[string]string{"type": "closed", "reason": reason})
	}

	conn.SetReadLimit(64 * 1024)
	conn.SetReadDeadline(time.Now().Add(liveTicketWait))
	var hello struct {
		Ticket   string `json:"ticket"`
		Cols     int    `json:"cols"`
		Rows     int    `json:"rows"`
		Terminal string `json:"terminal"`
		Seen     int64  `json:"seen"`
	}
	if err := conn.ReadJSON(&hello); err != nil {
		return
	}
	ticket, err := session.VerifyTerminalTicket(hello.Ticket, s.cfg.CandidateSessionSecret)
	if err != nil || !spendTerminalTicket(hello.Ticket, ticket.Exp) {
		return
	}
	ctx := r.Context()
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
	cols, rows := clamp(hello.Cols, 20, 400, 120), clamp(hello.Rows, 5, 200, 30)

	// Back to a shell this page had, if it is still there. The id only
	// finds a shell within the ticket's own session.
	var t *liveTerminal
	resumed := false
	if hello.Terminal != "" {
		if t = findTerminal(sess.ID, hello.Terminal); t != nil {
			resumed = true
			_ = t.pty.Resize(ctx, cols, rows)
		}
	}
	if t == nil {
		var refusal string
		if t, refusal = s.openTerminal(ctx, sess, cols, rows, deadline); t == nil {
			closed(refusal)
			return
		}
	}
	seen := hello.Seen
	if !resumed {
		seen = 0
	}
	if !t.attach(conn, seen, resumed) {
		closed("That shell has ended. Press Enter for a new one.")
		return
	}
	defer t.detach(conn)

	// Page → sandbox, until the page goes or the shell does (end closes conn).
	for {
		conn.SetReadDeadline(deadline)
		kind, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if kind == websocket.BinaryMessage {
			if t.write(data) != nil {
				return
			}
			continue
		}
		var control struct {
			Type string `json:"type"`
			Cols int    `json:"cols"`
			Rows int    `json:"rows"`
		}
		if json.Unmarshal(data, &control) != nil {
			continue
		}
		switch control.Type {
		case "resize":
			_ = t.pty.Resize(ctx, clamp(control.Cols, 20, 400, cols), clamp(control.Rows, 5, 200, rows))
		case "end":
			// The candidate closed this terminal on purpose: no reason to
			// keep its shell for them to come back to.
			t.end("")
			return
		}
	}
}

func clamp(v, lo, hi, fallback int) int {
	if v < lo || v > hi {
		return fallback
	}
	return v
}
