package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// streamChunk is one server-sent event of a streamed chat completion.
type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int     `json:"prompt_tokens"`
		CompletionTokens int     `json:"completion_tokens"`
		Cost             float64 `json:"cost"`
	} `json:"usage,omitempty"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// CompleteQuickStream is CompleteQuick, delivering the reply piece by piece
// as the model writes it. onDelta is called with each piece, in order, on
// the calling goroutine; the whole reply is also returned at the end, and is
// what callers should store.
//
// An error before the first piece means nothing was delivered. An error
// after it means the reply stopped partway: what had arrived is returned
// alongside the error, and has already been passed to onDelta.
func (c *OpenRouterClient) CompleteQuickStream(ctx context.Context, model string, messages []ChatMessage, maxTokens int, onDelta func(string)) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	body, err := json.Marshal(struct {
		chatRequest
		Stream bool `json:"stream"`
	}{
		chatRequest: chatRequest{Model: model, Messages: messages, Temperature: 0.2, MaxTokens: maxTokens, Reasoning: &reasoning{Effort: "low"}, Usage: usageOption{Include: true}},
		Stream:      true,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("HTTP-Referer", "https://mindfries.com")
	req.Header.Set("X-Title", "Mindfries")

	// Not c.httpClient: its overall timeout would cut a long reply off
	// mid-stream. The caller's context bounds this request instead.
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", fmt.Errorf("llm: openrouter request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		// Refused before streaming began — the body is an ordinary JSON error.
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		var out chatResponse
		if json.Unmarshal(raw, &out) == nil && out.Error != nil {
			return "", fmt.Errorf("llm: openrouter error: %s", out.Error.Message)
		}
		return "", fmt.Errorf("llm: openrouter http %d: %s", resp.StatusCode, string(raw))
	}

	var reply strings.Builder
	truncated := false
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		// Blank lines separate events; lines starting ":" are keep-alive comments.
		data, ok := strings.CutPrefix(line, "data:")
		if !ok {
			continue
		}
		data = strings.TrimSpace(data)
		if data == "[DONE]" {
			break
		}
		var chunk streamChunk
		if json.Unmarshal([]byte(data), &chunk) != nil {
			continue
		}
		if chunk.Error != nil {
			return reply.String(), fmt.Errorf("llm: openrouter error: %s", chunk.Error.Message)
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				reply.WriteString(choice.Delta.Content)
				onDelta(choice.Delta.Content)
			}
			if choice.FinishReason == "length" {
				truncated = true
			}
		}
		if chunk.Usage != nil && c.OnUsage != nil {
			agent, sessionID := tagsFrom(ctx)
			c.OnUsage(ctx, Usage{
				Agent: agent, SessionID: sessionID, Model: model,
				PromptTokens: chunk.Usage.PromptTokens, CompletionTokens: chunk.Usage.CompletionTokens, CostUSD: chunk.Usage.Cost,
			})
		}
	}
	if err := scanner.Err(); err != nil {
		return reply.String(), fmt.Errorf("llm: openrouter stream broke off: %w", err)
	}
	if reply.Len() == 0 {
		return "", errors.New("llm: openrouter returned an empty reply")
	}
	if truncated {
		return reply.String(), ErrTruncated
	}
	return reply.String(), nil
}
