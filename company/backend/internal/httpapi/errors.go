package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// writeJSON is the one place a response body gets encoded, so every handler
// gets the same content type and error handling if encoding itself fails.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("httpapi: encoding response failed", "error", err)
	}
}

// apiError is the shared error shape — {"error": "human sentence"} — plain
// enough for a frontend to show directly, matching this repo's existing
// "errors explain what went wrong" convention.
type apiError struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, apiError{Error: message})
}

func notConfigured(w http.ResponseWriter, feature string) {
	writeError(w, http.StatusServiceUnavailable, feature+" is not configured yet")
}
