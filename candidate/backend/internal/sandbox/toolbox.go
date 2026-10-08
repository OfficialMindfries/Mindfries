package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// The rest of what a candidate's workspace needs from a sandbox: its state,
// starting it again after Daytona stopped it for being idle, files in and
// out, and a terminal.
//
// Every route here was run against Daytona on 2026-10-08 (see
// workspace_live_test.go, which does it again on request): the lifecycle
// routes on the API host, the file and PTY routes on the toolbox proxy.

// ErrNotFound is a file or sandbox Daytona says isn't there.
var ErrNotFound = errors.New("sandbox: not found")

// State is a sandbox's lifecycle state as Daytona reports it: "started",
// "stopped", "creating", "starting", "stopping", "archived", "error", …
func (c *Client) State(ctx context.Context, sandboxID string) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	var sb Sandbox
	if err := c.do(ctx, http.MethodGet, c.baseURL+"/sandbox/"+url.PathEscape(sandboxID), nil, &sb); err != nil {
		return "", err
	}
	return sb.State, nil
}

// EnsureStarted returns once the sandbox is running, starting it if Daytona
// had stopped it. A sandbox stops by itself after a stretch with no
// activity; a candidate who went quiet reading the task comes back to a
// stopped machine, and starting it takes a couple of seconds and keeps
// every file. An archived or errored sandbox is reported as it is.
func (c *Client) EnsureStarted(ctx context.Context, sandboxID string) error {
	deadline := time.Now().Add(90 * time.Second)
	asked := false
	for {
		state, err := c.State(ctx, sandboxID)
		if err != nil {
			return err
		}
		switch state {
		case "started":
			return nil
		case "stopped", "archived":
			if !asked {
				if err := c.do(ctx, http.MethodPost, c.baseURL+"/sandbox/"+url.PathEscape(sandboxID)+"/start", nil, nil); err != nil {
					return err
				}
				asked = true
			}
		case "error", "build_failed", "destroyed", "destroying":
			return fmt.Errorf("sandbox: %s is %s", sandboxID, state)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("sandbox: %s did not start in time (state %q)", sandboxID, state)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(700 * time.Millisecond):
		}
	}
}

func (c *Client) toolbox(sandboxID, path string) string {
	return fmt.Sprintf("%s/toolbox/%s%s", c.proxyURL, url.PathEscape(sandboxID), path)
}

// raw is do() for the routes that don't speak JSON both ways: it returns
// the response body as it came.
func (c *Client) raw(ctx context.Context, method, u string, body io.Reader, contentType string) ([]byte, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sandbox: request to %s: %w", u, err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("sandbox: %s %s: http %d: %s", method, u, resp.StatusCode, truncate(string(b), 300))
	}
	return b, nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}

// WriteFile writes a file, creating the directories above it. `path` is
// relative to the sandbox user's home, or absolute.
func (c *Client) WriteFile(ctx context.Context, sandboxID, path string, content []byte) error {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", "file")
	if err != nil {
		return err
	}
	if _, err := part.Write(content); err != nil {
		return err
	}
	if err := mw.Close(); err != nil {
		return err
	}
	_, err = c.raw(ctx, http.MethodPost, c.toolbox(sandboxID, "/files/upload-v2?path="+url.QueryEscape(path)), &buf, mw.FormDataContentType())
	return err
}

// ReadFile returns a file's bytes. ErrNotFound when it isn't there.
func (c *Client) ReadFile(ctx context.Context, sandboxID, path string) ([]byte, error) {
	return c.raw(ctx, http.MethodGet, c.toolbox(sandboxID, "/files/download?path="+url.QueryEscape(path)), nil, "")
}

// DeletePath removes a file, or a directory and everything in it.
func (c *Client) DeletePath(ctx context.Context, sandboxID, path string) error {
	_, err := c.raw(ctx, http.MethodDelete, c.toolbox(sandboxID, "/files?recursive=true&path="+url.QueryEscape(path)), nil, "")
	if errors.Is(err, ErrNotFound) {
		return nil // already gone is what was asked for
	}
	return err
}

// MovePath renames or moves a file or directory.
func (c *Client) MovePath(ctx context.Context, sandboxID, from, to string) error {
	_, err := c.raw(ctx, http.MethodPost, c.toolbox(sandboxID, "/files/move?source="+url.QueryEscape(from)+"&destination="+url.QueryEscape(to)), nil, "")
	return err
}

// MakeDir creates a directory and any above it.
func (c *Client) MakeDir(ctx context.Context, sandboxID, path string) error {
	_, err := c.raw(ctx, http.MethodPost, c.toolbox(sandboxID, "/files/folder?mode=755&path="+url.QueryEscape(path)), nil, "")
	return err
}

// ── Terminal ────────────────────────────────────────────────────────────────

// PTYOptions describes the terminal to open.
type PTYOptions struct {
	ID   string            `json:"id"`
	Cwd  string            `json:"cwd,omitempty"`
	Cols int               `json:"cols"`
	Rows int               `json:"rows"`
	Envs map[string]string `json:"envs,omitempty"`
}

// PTY is an open terminal in a sandbox. Output arrives as binary frames;
// input is written as binary frames. Daytona's first frame is a text
// control message ({"type":"control","status":"connected"}), which Read
// skips.
type PTY struct {
	client    *Client
	sandboxID string
	id        string
	conn      *websocket.Conn
}

// OpenPTY starts a shell in the sandbox and connects to it.
func (c *Client) OpenPTY(ctx context.Context, sandboxID string, opts PTYOptions) (*PTY, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	if err := c.do(ctx, http.MethodPost, c.toolbox(sandboxID, "/process/pty"), opts, nil); err != nil {
		return nil, err
	}
	wsURL := "wss" + strings.TrimPrefix(c.toolbox(sandboxID, "/process/pty/"+url.PathEscape(opts.ID)+"/connect"), "https")
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, http.Header{"Authorization": {"Bearer " + c.apiKey}})
	if err != nil {
		// The shell was started; don't leave it running with nobody attached.
		_, _ = c.raw(context.WithoutCancel(ctx), http.MethodDelete, c.toolbox(sandboxID, "/process/pty/"+url.PathEscape(opts.ID)), nil, "")
		return nil, fmt.Errorf("sandbox: connecting to the terminal: %w", err)
	}
	conn.SetReadLimit(4 << 20)
	return &PTY{client: c, sandboxID: sandboxID, id: opts.ID, conn: conn}, nil
}

// Read returns the next chunk of terminal output. It returns an error when
// the shell has exited or the connection is gone.
func (p *PTY) Read() ([]byte, error) {
	for {
		kind, data, err := p.conn.ReadMessage()
		if err != nil {
			return nil, err
		}
		if kind == websocket.BinaryMessage {
			return data, nil
		}
		// Text frames are Daytona's own control messages, not shell output.
		var control struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(data, &control) == nil && control.Type == "control" {
			continue
		}
		return data, nil
	}
}

// Write sends keystrokes to the shell.
func (p *PTY) Write(data []byte) error {
	return p.conn.WriteMessage(websocket.BinaryMessage, data)
}

// Resize tells the shell its window changed size.
func (p *PTY) Resize(ctx context.Context, cols, rows int) error {
	return p.client.do(ctx, http.MethodPost, p.client.toolbox(p.sandboxID, "/process/pty/"+url.PathEscape(p.id)+"/resize"), map[string]int{"cols": cols, "rows": rows}, nil)
}

// Close ends the shell and the connection to it.
func (p *PTY) Close() {
	_ = p.conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _ = p.client.raw(ctx, http.MethodDelete, p.client.toolbox(p.sandboxID, "/process/pty/"+url.PathEscape(p.id)), nil, "")
}
