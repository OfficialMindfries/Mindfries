// Command server runs the Mindfries candidate backend — the Application
// API, Assessment Orchestrator, and Admin Portal API (PRD §2.3, confirmed
// Go 2026-09-12), sharing the same Supabase Postgres database as
// candidate/frontend and internal-admin/frontend.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/httpapi"
	"github.com/mindfries/candidate-backend/internal/llm"
	"github.com/mindfries/candidate-backend/internal/orchestrator"
	"github.com/mindfries/candidate-backend/internal/sandbox"
	"github.com/mindfries/candidate-backend/internal/ws"
)

func main() {
	// .env.local wins over .env, and both lose to whatever is already in the
	// process environment — same precedence every migrate.mts in this repo
	// already uses.
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

	agents := llm.NewAgents(llm.NewOpenRouterClient(cfg.OpenRouterAPIKey, cfg.OpenRouterBaseURL), llm.DefaultAgentModels())
	sandboxClient := sandbox.New(cfg.DaytonaAPIKey, cfg.DaytonaBaseURL)
	hub := ws.NewHub(cfg.AllowedOrigins)
	orc := orchestrator.New(database, agents, sandboxClient, hub)

	server := httpapi.New(cfg, database, orc, hub)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      server.Routes(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 120 * time.Second, // an agent-backed request can run long; see handleSubmit's own async pattern for the ones that would exceed even this
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
