// Package sandbox provisions and drives the Isolated Candidate Sandbox
// (PRD §1.2, §2.3 — Daytona). Every call is a real HTTP request against
// Daytona's REST API; nothing here fabricates a sandbox when DAYTONA_API_KEY
// is unset — Configured() reports that plainly and every method refuses with
// ErrNotConfigured instead.
//
// Endpoint shapes below are taken from Daytona's own docs
// (daytona.io/docs/en/getting-started, and the toolbox process-execution
// route surfaced from daytona.io/docs/en/process-code-execution) as of
// 2026-09-12. Two of Daytona's own docs, not just one, describe the create
// and execute routes below; the delete route is the one REST-convention
// assumption in this file — confirm it against Daytona's current API
// reference (or switch to their SDK) before depending on it for anything
// that must not silently no-op.
package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrNotConfigured is returned by every method when DAYTONA_API_KEY is
// empty — the honest "not wired up yet" failure, not a fabricated sandbox.
var ErrNotConfigured = errors.New("sandbox: Daytona is not configured (DAYTONA_API_KEY unset)")

// Client talks to Daytona's REST API directly (POST /sandbox, and the
// toolbox proxy for command execution) rather than through Daytona's own
// SDK, so the Go backend has no dependency on it beyond an HTTP client.
type Client struct {
	apiKey     string
	baseURL    string // e.g. https://app.daytona.io/api
	proxyURL   string // e.g. https://proxy.app.daytona.io
	httpClient *http.Client
}

// New constructs a client. baseURL defaults to Daytona's production API when
// empty. An empty apiKey is allowed — Configured() will report false, and
// every method will refuse with ErrNotConfigured, which is the state most
// environments are in until someone adds a real key.
func New(apiKey, baseURL string) *Client {
	if baseURL == "" {
		baseURL = "https://app.daytona.io/api"
	}
	return &Client{
		apiKey:     apiKey,
		baseURL:    baseURL,
		proxyURL:   "https://proxy.app.daytona.io",
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// Configured reports whether a Daytona API key is present. Callers should
// check this before doing anything sandbox-related that a candidate is
// waiting on, so the honest "not available yet" answer comes back fast
// instead of after a network round trip that was always going to fail.
func (c *Client) Configured() bool { return c.apiKey != "" }

// Sandbox is the subset of Daytona's sandbox object this backend uses.
type Sandbox struct {
	ID    string `json:"id"`
	State string `json:"state,omitempty"`
}

// CreateOptions mirrors the documented request body for POST /sandbox — all
// fields optional; an empty CreateOptions{} is itself a valid request.
type CreateOptions struct {
	Snapshot string            `json:"snapshot,omitempty"`
	Image    string            `json:"image,omitempty"`
	CPU      int               `json:"cpu,omitempty"`
	Memory   int               `json:"memory,omitempty"`
	Disk     int               `json:"disk,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
}

func (c *Client) do(ctx context.Context, method, url string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("sandbox: request to %s: %w", url, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("sandbox: %s %s: http %d: %s", method, url, resp.StatusCode, string(respBody))
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("sandbox: decoding response from %s: %w", url, err)
		}
	}
	return nil
}

// CreateSandbox provisions a new isolated sandbox for one assessment
// session. POST /sandbox, per Daytona's docs.
func (c *Client) CreateSandbox(ctx context.Context, opts CreateOptions) (Sandbox, error) {
	if !c.Configured() {
		return Sandbox{}, ErrNotConfigured
	}
	var sb Sandbox
	if err := c.do(ctx, http.MethodPost, c.baseURL+"/sandbox", opts, &sb); err != nil {
		return Sandbox{}, err
	}
	return sb, nil
}

// ExecuteResult is the toolbox process-execution response.
type ExecuteResult struct {
	ExitCode int    `json:"exitCode"`
	Output   string `json:"output"`
}

// ExecuteCommand runs a shell command inside an already-created sandbox, via
// Daytona's toolbox proxy (proxy.app.daytona.io/toolbox/{sandboxId}/process/execute).
// Daytona documents this as its legacy REST route — kept here because it's
// the one path confirmed without pulling in Daytona's SDK, but worth
// revisiting if Daytona removes it.
func (c *Client) ExecuteCommand(ctx context.Context, sandboxID, command string) (ExecuteResult, error) {
	if !c.Configured() {
		return ExecuteResult{}, ErrNotConfigured
	}
	var res ExecuteResult
	url := fmt.Sprintf("%s/toolbox/%s/process/execute", c.proxyURL, sandboxID)
	if err := c.do(ctx, http.MethodPost, url, map[string]string{"command": command}, &res); err != nil {
		return ExecuteResult{}, err
	}
	return res, nil
}

// DeleteSandbox tears down a sandbox once a session ends. DELETE /sandbox/{id}
// follows Daytona's general REST convention for the other resources in its
// API — unlike CreateSandbox and ExecuteCommand above, this specific route
// was not directly confirmed against Daytona's docs while writing this
// client; verify it (or swap to Daytona's SDK) before relying on cleanup
// actually happening.
func (c *Client) DeleteSandbox(ctx context.Context, sandboxID string) error {
	if !c.Configured() {
		return ErrNotConfigured
	}
	return c.do(ctx, http.MethodDelete, c.baseURL+"/sandbox/"+sandboxID, nil, nil)
}
