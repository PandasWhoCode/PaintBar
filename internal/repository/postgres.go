package repository

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPostgresPool creates a new pgx connection pool with sensible defaults.
// It retries the connection up to maxRetries times with exponential backoff.
func NewPostgresPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 2
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second

	var pool *pgxpool.Pool
	maxRetries := 5

	for i := 0; i < maxRetries; i++ {
		pool, err = pgxpool.NewWithConfig(ctx, config)
		if err == nil {
			// Verify connection
			if pingErr := pool.Ping(ctx); pingErr == nil {
				slog.Info("postgres connected",
					"max_conns", config.MaxConns,
					"min_conns", config.MinConns,
				)
				return pool, nil
			} else {
				pool.Close()
				err = pingErr
			}
		}

		backoff := time.Duration(1<<uint(i)) * time.Second
		slog.Warn("postgres connection failed, retrying",
			"attempt", i+1,
			"max_retries", maxRetries,
			"backoff", backoff,
			"error", err,
		)
		time.Sleep(backoff)
	}

	return nil, fmt.Errorf("postgres connection failed after %d retries: %w", maxRetries, err)
}

// HealthCheck pings the database and returns an error if unreachable.
func HealthCheck(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return pool.Ping(ctx)
}
