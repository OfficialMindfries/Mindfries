// Package config loads and validates the backend's environment. Nothing here
// defaults a secret or a credential to a placeholder — an unset value stays
// empty and every package that needs it fails honestly at the point of use,
// the same "real, or an honest failure" rule the candidate workspace holds
// itself to (see candidate/frontend AGENTS.md and CLAUDE.md).
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config is every environment-derived setting the server needs. Fields for
// optional integrations (OpenRouter, Daytona, Gemini) are deliberately not
// validated here — an empty string just means that integration answers
// "not configured" wherever it's called, rather than the whole process
// refusing to start over a feature nobody has keys for yet.
type Config struct {
	// Port the HTTP server listens on.
	Port string

	// DatabaseURL is a direct Postgres connection string (the same one
	// candidate/frontend and internal-admin/frontend use for migrations) —
	// required. Without it there is no data layer at all, so the process
	// refuses to start rather than serving a backend that can't do anything.
	DatabaseURL string

	// CandidateSessionSecret verifies the "mf_candidate" cookie Next.js signs
	// in candidate/frontend/src/lib/auth/session.ts. Must be the exact same
	// value as that app's SESSION_SECRET — copy it, don't regenerate it.
	CandidateSessionSecret string

	// AdminSessionSecret verifies the "mf_admin" cookie internal-admin/frontend
	// signs the same way. Same rule: copy internal-admin's SESSION_SECRET.
	AdminSessionSecret string

	// AllowedOrigins is the CORS allowlist — the Next.js apps' own origins,
	// since cookies only travel cross-origin with an explicit allowed origin
	// (never "*") and credentials mode.
	AllowedOrigins []string

	// OpenRouterAPIKey — unified access to every non-realtime LLM call
	// (System_Archetect_And_PRD.md §2.3, confirmed 2026-09-12). Empty means
	// the four analysis agents (Code Evaluation, Reasoning, Workflow, Report)
	// answer "not configured" instead of silently returning fabricated output.
	OpenRouterAPIKey  string
	OpenRouterBaseURL string

	// GeminiAPIKey — the AI Interview agent's direct connection to Gemini's
	// Live API. Kept separate from OpenRouter on purpose: Live API is a
	// bidirectional real-time-audio WebSocket, a protocol OpenRouter doesn't
	// proxy (see the PRD's LLM Providers table).
	GeminiAPIKey string

	// DaytonaAPIKey / DaytonaBaseURL — sandbox orchestration. Empty means
	// session start still records a real row, but sandbox provisioning
	// reports itself as not wired up rather than pretending a workspace
	// exists.
	DaytonaAPIKey  string
	DaytonaBaseURL string
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitCSV(v string) []string {
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// Load reads Config from the process environment and validates the fields
// nothing can run without. It does not read .env files itself — that's the
// caller's job (see cmd/server/main.go), same split every ported migrate.mts
// script in this repo already uses.
func Load() (Config, error) {
	cfg := Config{
		Port:                   getenv("PORT", "8080"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		CandidateSessionSecret: os.Getenv("CANDIDATE_SESSION_SECRET"),
		AdminSessionSecret:     os.Getenv("ADMIN_SESSION_SECRET"),
		AllowedOrigins:         splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")),
		OpenRouterAPIKey:       os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterBaseURL:      getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
		GeminiAPIKey:           os.Getenv("GEMINI_API_KEY"),
		DaytonaAPIKey:          os.Getenv("DAYTONA_API_KEY"),
		DaytonaBaseURL:         getenv("DAYTONA_BASE_URL", "https://app.daytona.io/api"),
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required environment variable(s): %s", strings.Join(missing, ", "))
	}

	return cfg, nil
}

// Warnings lists optional-but-usually-wanted settings that are unset, so
// startup can log them once instead of every handler discovering the gap on
// its own request.
func (c Config) Warnings() []string {
	var w []string
	if c.CandidateSessionSecret == "" {
		w = append(w, "CANDIDATE_SESSION_SECRET is not set — every candidate-authenticated request will be refused")
	}
	if c.AdminSessionSecret == "" {
		w = append(w, "ADMIN_SESSION_SECRET is not set — every admin-authenticated request will be refused")
	}
	if c.OpenRouterAPIKey == "" {
		w = append(w, "OPENROUTER_API_KEY is not set — Code Evaluation, Reasoning, Workflow and Report agents will answer 'not configured'")
	}
	if c.GeminiAPIKey == "" {
		w = append(w, "GEMINI_API_KEY is not set — the AI Interview agent will answer 'not configured'")
	}
	if c.DaytonaAPIKey == "" {
		w = append(w, "DAYTONA_API_KEY is not set — sandbox provisioning will answer 'not configured'; sessions still record")
	}
	return w
}

// LoadEnvFiles does the same plain-text .env / .env.local parsing every
// migrate.mts in this repo does by hand: existing process env wins, first
// file wins over the second, blank lines and quotes are handled, nothing
// else. No external dependency for something this small.
func LoadEnvFiles(files ...string) {
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimRight(line, "\r")
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			eq := strings.IndexByte(line, '=')
			if eq < 1 {
				continue
			}
			key := strings.TrimSpace(line[:eq])
			val := strings.TrimSpace(line[eq+1:])
			val = strings.Trim(val, `"'`)
			if val == "" {
				continue
			}
			if _, set := os.LookupEnv(key); !set {
				os.Setenv(key, val)
			}
		}
	}
}

// MustAtoi parses a positive integer env-style value, used by the few
// numeric settings that aren't worth their own Config field yet.
func MustAtoi(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}
