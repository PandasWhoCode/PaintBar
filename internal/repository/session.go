package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Session represents a user session stored in PostgreSQL.
type Session struct {
	ID        string
	UserID    string
	TokenHash string
	IPAddress string
	UserAgent string
	ExpiresAt time.Time
	CreatedAt time.Time
}

// SessionRepository handles session CRUD operations against PostgreSQL.
type SessionRepository struct {
	pool *pgxpool.Pool
}

// NewSessionRepository creates a new SessionRepository.
func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

// HashToken produces a SHA-256 hex digest of the raw token.
// We never store raw tokens — only hashes.
func HashToken(rawToken string) string {
	h := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(h[:])
}

// Create inserts a new session and returns the generated session ID.
func (r *SessionRepository) Create(ctx context.Context, userID, rawToken, ipAddress, userAgent string, ttl time.Duration) (string, error) {
	tokenHash := HashToken(rawToken)
	expiresAt := time.Now().Add(ttl)

	var id string
	err := r.pool.QueryRow(ctx,
		`INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
		 VALUES ($1, $2, $3::INET, $4, $5)
		 RETURNING id`,
		userID, tokenHash, ipAddress, userAgent, expiresAt,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}

	return id, nil
}

// GetByToken looks up a non-expired session by its raw token.
func (r *SessionRepository) GetByToken(ctx context.Context, rawToken string) (*Session, error) {
	tokenHash := HashToken(rawToken)

	s := &Session{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, token_hash, ip_address::TEXT, user_agent, expires_at, created_at
		 FROM sessions
		 WHERE token_hash = $1 AND expires_at > NOW()`,
		tokenHash,
	).Scan(&s.ID, &s.UserID, &s.TokenHash, &s.IPAddress, &s.UserAgent, &s.ExpiresAt, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get session by token: %w", err)
	}

	return s, nil
}

// DeleteByToken removes a session by its raw token (logout).
func (r *SessionRepository) DeleteByToken(ctx context.Context, rawToken string) error {
	tokenHash := HashToken(rawToken)

	tag, err := r.pool.Exec(ctx,
		`DELETE FROM sessions WHERE token_hash = $1`,
		tokenHash,
	)
	if err != nil {
		return fmt.Errorf("delete session by token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("session not found")
	}

	return nil
}

// DeleteByUserID removes all sessions for a user (force logout everywhere).
func (r *SessionRepository) DeleteByUserID(ctx context.Context, userID string) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM sessions WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return 0, fmt.Errorf("delete sessions by user: %w", err)
	}

	return tag.RowsAffected(), nil
}

// CleanupExpired removes all expired sessions. Returns the count of deleted rows.
func (r *SessionRepository) CleanupExpired(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM sessions WHERE expires_at <= NOW()`,
	)
	if err != nil {
		return 0, fmt.Errorf("cleanup expired sessions: %w", err)
	}

	return tag.RowsAffected(), nil
}
