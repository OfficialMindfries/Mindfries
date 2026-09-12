// Package llm is the AI Intelligence Layer's model access (PRD §1.9, §2.3).
// OpenRouter is the single key/billing surface for every non-realtime model
// call (Code Evaluation, Reasoning, Workflow, Report, vision RAG) — confirmed
// 2026-09-12. The AI Interview agent is the deliberate exception: Gemini's
// Live API is a direct bidirectional-audio WebSocket OpenRouter doesn't
// proxy, so it gets its own client (gemini_live.go), not this one.
package llm

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

// ErrNotConfigured is returned by Complete when no OpenRouter key is set —
// the honest failure, never a fabricated completion.
var ErrNotConfigured = errors.New("llm: OpenRouter is not configured (OPENROUTER_API_KEY unset)")

// OpenRouterClient is an OpenAI-compatible chat-completions client pointed
// at OpenRouter (https://openrouter.ai/docs — /chat/completions accepts the
// same request/response shape as OpenAI's API, with "provider/model" as the
// model string).
type OpenRouterClient struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewOpenRouterClient builds a client. An empty apiKey is allowed —
// Configured() reports false and Complete refuses with ErrNotConfigured,
// which is the state of most environments until a key is added.
func NewOpenRouterClient(apiKey, baseURL string) *OpenRouterClient {
	if baseURL == "" {
		baseURL = "https://openrouter.ai/api/v1"
	}
	return &OpenRouterClient{
		apiKey:     apiKey,
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 90 * time.Second}, // agent prompts can run long over a big diff/event trail
	}
}

// Configured reports whether an API key is present.
func (c *OpenRouterClient) Configured() bool { return c.apiKey != "" }

// ChatMessage is one turn in a chat-completion request.
type ChatMessage struct {
	Role    string `json:"role"` // "system" | "user" | "assistant"
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Complete sends one chat-completion request and returns the first choice's
// message content. model is an OpenRouter model slug, e.g.
// "anthropic/claude-sonnet-4.5" — see agents.go for how each agent's model is
// chosen and overridden.
func (c *OpenRouterClient) Complete(ctx context.Context, model string, messages []ChatMessage) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}

	body, err := json.Marshal(chatRequest{Model: model, Messages: messages, Temperature: 0.2})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	// Optional but recommended by OpenRouter for attribution on their
	// dashboard/leaderboards — harmless to omit, worth setting since we have it.
	req.Header.Set("HTTP-Referer", "https://mindfries.com")
	req.Header.Set("X-Title", "Mindfries")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm: openrouter request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("llm: openrouter returned unparseable response (http %d): %s", resp.StatusCode, string(raw))
	}
	if out.Error != nil {
		return "", fmt.Errorf("llm: openrouter error: %s", out.Error.Message)
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("llm: openrouter http %d: %s", resp.StatusCode, string(raw))
	}
	if len(out.Choices) == 0 {
		return "", errors.New("llm: openrouter returned no choices")
	}
	return out.Choices[0].Message.Content, nil
}
