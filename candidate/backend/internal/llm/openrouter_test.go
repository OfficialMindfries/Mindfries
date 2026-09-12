package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCompleteRefusesWhenNotConfigured(t *testing.T) {
	c := NewOpenRouterClient("", "")
	if c.Configured() {
		t.Fatal("expected Configured() to be false with an empty key")
	}
	if _, err := c.Complete(context.Background(), "any-model", nil); err != ErrNotConfigured {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

// fakeOpenRouter stands in for openrouter.ai's /chat/completions endpoint,
// so Complete's real HTTP request/response handling is exercised end to end
// without a network call to the actual service.
func fakeOpenRouter(t *testing.T, reply string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization header = %q", got)
		}
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decoding request body: %v", err)
		}
		if req.Model == "" || len(req.Messages) == 0 {
			t.Fatalf("incomplete request forwarded: %+v", req)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{
			Choices: []struct {
				Message ChatMessage `json:"message"`
			}{{Message: ChatMessage{Role: "assistant", Content: reply}}},
		})
	}))
}

func TestCompleteReturnsFirstChoice(t *testing.T) {
	srv := fakeOpenRouter(t, "the model's answer")
	defer srv.Close()

	c := NewOpenRouterClient("test-key", srv.URL)
	got, err := c.Complete(context.Background(), "anthropic/claude-sonnet-4.5", []ChatMessage{{Role: "user", Content: "hello"}})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if got != "the model's answer" {
		t.Fatalf("got %q", got)
	}
}

func TestCompleteSurfacesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"message": "rate limited"}})
	}))
	defer srv.Close()

	c := NewOpenRouterClient("test-key", srv.URL)
	_, err := c.Complete(context.Background(), "m", []ChatMessage{{Role: "user", Content: "hi"}})
	if err == nil || !strings.Contains(err.Error(), "rate limited") {
		t.Fatalf("expected the API's error message to surface, got %v", err)
	}
}
