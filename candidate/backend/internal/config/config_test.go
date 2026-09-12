package config

import (
	"os"
	"path/filepath"
	"testing"
)

func clearEnv(t *testing.T, keys ...string) {
	t.Helper()
	for _, k := range keys {
		old, had := os.LookupEnv(k)
		os.Unsetenv(k)
		t.Cleanup(func() {
			if had {
				os.Setenv(k, old)
			}
		})
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	clearEnv(t, "DATABASE_URL")
	if _, err := Load(); err == nil {
		t.Fatal("expected an error when DATABASE_URL is unset")
	}
}

func TestLoadDefaults(t *testing.T) {
	clearEnv(t, "DATABASE_URL", "PORT", "ALLOWED_ORIGINS", "OPENROUTER_BASE_URL", "DAYTONA_BASE_URL")
	os.Setenv("DATABASE_URL", "postgres://example")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
	if cfg.OpenRouterBaseURL != "https://openrouter.ai/api/v1" {
		t.Errorf("OpenRouterBaseURL = %q", cfg.OpenRouterBaseURL)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Errorf("AllowedOrigins = %v, want 2 defaults", cfg.AllowedOrigins)
	}
}

func TestWarningsFlagEveryUnsetOptionalSetting(t *testing.T) {
	cfg := Config{}
	warnings := cfg.Warnings()
	if len(warnings) != 5 {
		t.Fatalf("got %d warnings, want 5 (one per optional setting): %v", len(warnings), warnings)
	}
}

func TestWarningsEmptyWhenEverythingSet(t *testing.T) {
	cfg := Config{
		CandidateSessionSecret: "x",
		AdminSessionSecret:     "x",
		OpenRouterAPIKey:       "x",
		GeminiAPIKey:           "x",
		DaytonaAPIKey:          "x",
	}
	if w := cfg.Warnings(); len(w) != 0 {
		t.Fatalf("expected no warnings, got %v", w)
	}
}

func TestLoadEnvFilesPrecedence(t *testing.T) {
	clearEnv(t, "MF_TEST_ONE", "MF_TEST_TWO", "MF_TEST_THREE")
	dir := t.TempDir()

	local := filepath.Join(dir, ".env.local")
	plain := filepath.Join(dir, ".env")
	os.WriteFile(local, []byte("MF_TEST_ONE=from-local\nMF_TEST_TWO=\"quoted\"\n"), 0o644)
	os.WriteFile(plain, []byte("MF_TEST_ONE=from-plain\nMF_TEST_THREE=from-plain\n# a comment\n"), 0o644)

	// Already-set process env beats both files.
	os.Setenv("MF_TEST_THREE", "already-set")
	t.Cleanup(func() { os.Unsetenv("MF_TEST_THREE") })

	LoadEnvFiles(local, plain)

	if v := os.Getenv("MF_TEST_ONE"); v != "from-local" {
		t.Errorf("MF_TEST_ONE = %q, want from-local (first file wins)", v)
	}
	if v := os.Getenv("MF_TEST_TWO"); v != "quoted" {
		t.Errorf("MF_TEST_TWO = %q, want quoted (quotes stripped)", v)
	}
	if v := os.Getenv("MF_TEST_THREE"); v != "already-set" {
		t.Errorf("MF_TEST_THREE = %q, want already-set (process env wins over files)", v)
	}
}

func TestMustAtoi(t *testing.T) {
	cases := []struct {
		in       string
		fallback int
		want     int
	}{
		{"", 5, 5},
		{"10", 5, 10},
		{"not-a-number", 5, 5},
		{"-1", 5, 5},
	}
	for _, c := range cases {
		if got := MustAtoi(c.in, c.fallback); got != c.want {
			t.Errorf("MustAtoi(%q, %d) = %d, want %d", c.in, c.fallback, got, c.want)
		}
	}
}
