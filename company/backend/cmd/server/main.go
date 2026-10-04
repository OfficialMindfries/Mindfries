// Command server runs the Mindfries company backend — the company-side
// Application API (roles, candidate pipeline, team, billing), sharing the
// same Supabase Postgres database as company/frontend.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/mindfries/company-backend/internal/config"
	"github.com/mindfries/company-backend/internal/db"
	"github.com/mindfries/company-backend/internal/httpapi"
)

func main() {
	// .env.local wins over .env, and both lose to whatever is already in the
	// process environment — same precedence every migrate.mts in this repo
	// already uses, and the same split candidate/backend's own main.go uses.
	config.LoadEnvFiles(".env.local", ".env")

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "error", err)
		os.Exit(1)
	}
	for _, w := range cfg.Warnings() {
		slog.Warn(w)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	server := httpapi.New(cfg, database)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      server.Routes(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("listening", "port", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown", "error", err)
	}
}
