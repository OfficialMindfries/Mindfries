// Package config loads and validates the backend's environment. Nothing here
// defaults a secret or a credential to a placeholder — an unset value stays
// empty and every package that needs it fails honestly at the point of use,
// the same "real, or an honest failure" rule candidate/backend already holds
// itself to (see its own internal/config/config.go).
package config

import (
	"fmt"
	"os"
	"strings"
)

// Config is every environment-derived setting the server needs. Fields for
// the optional Stripe integration are deliberately not validated here — an
// empty string just means billing answers "not configured" wherever it's
// called, rather than the whole process refusing to start over a feature
// nobody has keys for yet.
type Config struct {
	// Port the HTTP server listens on.
	Port string

	// DatabaseURL is a direct Postgres connection string (the same one
	// company/frontend uses for migrations) — required. Without it there is
	// no data layer at all, so the process refuses to start rather than
	// serving a backend that can't do anything.
	DatabaseURL string

	// CompanySessionSecret verifies the "mf_company" cookie Next.js signs in
	// company/frontend/lib/auth/session.ts. Must be the exact same value as
	// that app's SESSION_SECRET — copy it, don't regenerate it.
	CompanySessionSecret string

	// AllowedOrigins is the CORS allowlist — company/frontend's own origin,
	// since cookies only travel cross-origin with an explicit allowed origin
	// (never "*") and credentials mode.
	AllowedOrigins []string

	// StripeSecretKey / StripeWebhookSecret — real Stripe billing (Phase 4).
	// Empty means checkout/portal/webhook handlers answer "not configured"
	// instead of silently failing against Stripe's API.
	StripeSecretKey     string
	StripeWebhookSecret string

	// StripePriceStarter / _Growth / _Enterprise — the plan-name to Stripe
	// Price ID table, env-configured like every other cross-service address
	// in this repo (SUPABASE_URL, DATABASE_URL) rather than hardcoded.
	StripePriceStarter    string
	StripePriceGrowth     string
	StripePriceEnterprise string

	// CompanyFrontendURL builds the success/cancel/return URLs Stripe
	// redirects to after checkout or the billing portal — company/frontend's
	// own origin, same value as (the first of) AllowedOrigins in every real
	// deployment, kept separate so it can carry a path-free origin even if
	// ALLOWED_ORIGINS ever lists more than one.
	CompanyFrontendURL string
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
// caller's job (see cmd/server/main.go), same split every migrate.mts script
// in this repo already uses.
func Load() (Config, error) {
	cfg := Config{
		Port:                  getenv("PORT", "8081"),
		DatabaseURL:           os.Getenv("DATABASE_URL"),
		CompanySessionSecret:  os.Getenv("COMPANY_SESSION_SECRET"),
		AllowedOrigins:        splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:3002")),
		StripeSecretKey:       os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:   os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePriceStarter:    os.Getenv("STRIPE_PRICE_STARTER"),
		StripePriceGrowth:     os.Getenv("STRIPE_PRICE_GROWTH"),
		StripePriceEnterprise: os.Getenv("STRIPE_PRICE_ENTERPRISE"),
		CompanyFrontendURL:    getenv("COMPANY_FRONTEND_URL", "http://localhost:3002"),
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
	if c.CompanySessionSecret == "" {
		w = append(w, "COMPANY_SESSION_SECRET is not set — every company-authenticated request will be refused")
	}
	if c.StripeSecretKey == "" {
		w = append(w, "STRIPE_SECRET_KEY is not set — billing checkout and portal links will answer 'not configured'")
	}
	if c.StripeWebhookSecret == "" {
		w = append(w, "STRIPE_WEBHOOK_SECRET is not set — the Stripe webhook will refuse every event")
	}
	return w
}

// StripeConfigured reports whether enough of Stripe is set up to serve
// checkout/portal requests at all.
func (c Config) StripeConfigured() bool {
	return c.StripeSecretKey != ""
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
