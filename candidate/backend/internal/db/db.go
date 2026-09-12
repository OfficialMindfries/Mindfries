// Package db is the Go backend's data layer against the shared Supabase
// Postgres database (supabase/migrations/*.sql) — the same database
// candidate/frontend and internal-admin/frontend read and write today. Every
// query here is plain SQL against tables those migrations already define;
// nothing here owns its own schema.
//
// Small, mechanical, typed row mapping per function — the same shape the
// TypeScript side already uses in lib/db.ts on both apps (see
// ADMIN_BACKEND_PLAN.md §5.1's description of that pattern) — rather than an
// ORM or generated query layer.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps the connection pool. A single instance is created at startup and
// shared across every request handler.
type DB struct {
	pool *pgxpool.Pool
}

// New opens a pool against a direct Postgres connection string — the same
// DATABASE_URL the *.mts migration scripts use, not the Supabase service-role
// REST key (that only reaches PostgREST, not a raw connection).
func New(ctx context.Context, databaseURL string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parsing DATABASE_URL: %w", err)
	}
	// Supabase terminates TLS with a certificate this pool doesn't carry a
	// root for — the connection is still encrypted, just not verified. Same
	// trade-off the migrate.mts scripts already make explicit for the same
	// reason.
	cfg.ConnConfig.TLSConfig.InsecureSkipVerify = true

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: connecting: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: ping failed: %w", err)
	}
	return &DB{pool: pool}, nil
}

// Close releases every pooled connection. Call once, at process shutdown.
func (d *DB) Close() {
	if d != nil && d.pool != nil {
		d.pool.Close()
	}
}

// Ping is used by the /status handler to report real database reachability,
// not just that the process is running.
func (d *DB) Ping(ctx context.Context) error {
	return d.pool.Ping(ctx)
}
