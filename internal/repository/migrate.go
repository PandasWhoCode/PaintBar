package repository

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"

	"github.com/pressly/goose/v3"

	// pgx stdlib driver for goose (which requires database/sql)
	_ "github.com/jackc/pgx/v5/stdlib"
)

// RunMigrations executes all pending Goose migrations using the embedded SQL files.
// The embed.FS must contain the migration files at its root (not nested).
func RunMigrations(ctx context.Context, databaseURL string, migrations embed.FS) error {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open database for migrations: %w", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrations)

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}

	if err := goose.UpContext(ctx, db, "."); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	slog.Info("database migrations applied successfully")
	return nil
}

// RollbackMigration rolls back the most recent migration.
func RollbackMigration(ctx context.Context, databaseURL string, migrations embed.FS) error {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open database for rollback: %w", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrations)

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}

	if err := goose.DownContext(ctx, db, "."); err != nil {
		return fmt.Errorf("rollback migration: %w", err)
	}

	slog.Info("database migration rolled back")
	return nil
}
