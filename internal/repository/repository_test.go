package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/pandasWhoCode/paintbar/migrations"
)

// testPool returns a pgxpool connected to the test database.
// Skips the test if DATABASE_URL is not set (no Postgres available).
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	ctx := context.Background()

	// Run migrations
	err := RunMigrations(ctx, dbURL, migrations.FS)
	require.NoError(t, err, "migrations should succeed")

	pool, err := NewPostgresPool(ctx, dbURL)
	require.NoError(t, err, "pool creation should succeed")

	t.Cleanup(func() {
		pool.Close()
	})

	return pool
}

// randomToken generates a random hex token for testing.
func randomToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// --- Helper function unit tests (no external deps) ---

func TestIsNotFoundError_Nil(t *testing.T) {
	assert.False(t, isNotFoundError(nil))
}

func TestIsNotFoundError_NotFound(t *testing.T) {
	assert.True(t, isNotFoundError(fmt.Errorf("rpc error: code = NotFound")))
}

func TestIsNotFoundError_NotFoundLower(t *testing.T) {
	assert.True(t, isNotFoundError(fmt.Errorf("document not found")))
}

func TestIsNotFoundError_OtherError(t *testing.T) {
	assert.False(t, isNotFoundError(fmt.Errorf("permission denied")))
}

func TestContains(t *testing.T) {
	assert.True(t, contains("hello world", "world"))
	assert.True(t, contains("hello", "hello"))
	assert.False(t, contains("hi", "hello"))
	assert.False(t, contains("", "a"))
	assert.True(t, contains("a", "a"))
}

func TestSearchString(t *testing.T) {
	assert.True(t, searchString("abcdef", "cde"))
	assert.True(t, searchString("abc", "abc"))
	assert.False(t, searchString("abc", "xyz"))
	assert.True(t, searchString("aaa", "a"))
}

func TestFirebaseClients_Close_Nil(t *testing.T) {
	fc := &FirebaseClients{}
	err := fc.Close()
	assert.NoError(t, err)
}

// --- HealthCheck tests ---

func TestHealthCheck(t *testing.T) {
	pool := testPool(t)
	err := HealthCheck(context.Background(), pool)
	assert.NoError(t, err)
}

// --- HashToken tests ---

func TestHashToken_Deterministic(t *testing.T) {
	token := "test-token-123"
	h1 := HashToken(token)
	h2 := HashToken(token)
	assert.Equal(t, h1, h2, "same input should produce same hash")
	assert.Len(t, h1, 64, "SHA-256 hex should be 64 chars")
}

func TestHashToken_DifferentInputs(t *testing.T) {
	h1 := HashToken("token-a")
	h2 := HashToken("token-b")
	assert.NotEqual(t, h1, h2, "different inputs should produce different hashes")
}

// --- Session CRUD tests ---

func TestSessionCreate(t *testing.T) {
	pool := testPool(t)
	repo := NewSessionRepository(pool)
	ctx := context.Background()

	token := randomToken()
	id, err := repo.Create(ctx, "user-1", token, "127.0.0.1", "TestAgent/1.0", 24*time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, id, "session ID should be returned")
}

func TestSessionGetByToken(t *testing.T) {
	pool := testPool(t)
	repo := NewSessionRepository(pool)
	ctx := context.Background()

	token := randomToken()
	_, err := repo.Create(ctx, "user-2", token, "10.0.0.1", "TestAgent/2.0", 24*time.Hour)
	require.NoError(t, err)

	session, err := repo.GetByToken(ctx, token)
	require.NoError(t, err)
	assert.Equal(t, "user-2", session.UserID)
	assert.Contains(t, session.IPAddress, "10.0.0.1", "IP should match (Postgres INET may append /32)")
	assert.Equal(t, "TestAgent/2.0", session.UserAgent)
	assert.True(t, session.ExpiresAt.After(time.Now()), "session should not be expired")
}

func TestSessionGetByToken_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := NewSessionRepository(pool)
	ctx := context.Background()

	_, err := repo.GetByToken(ctx, "nonexistent-token")
	assert.Error(t, err, "should error for nonexistent token")
}

func TestSessionDeleteByToken(t *testing.T) {
	pool := testPool(t)
	repo := NewSessionRepository(pool)
	ctx := context.Background()

	token := randomToken()
	_, err := repo.Create(ctx, "user-3", token, "127.0.0.1", "TestAgent", 24*time.Hour)
	require.NoError(t, err)

	err = repo.DeleteByToken(ctx, token)
	require.NoError(t, err)

	// Should no longer be found
	_, err = repo.GetByToken(ctx, token)
	assert.Error(t, err)
}

func TestSessionDeleteByUserID(t *testing.T) {
	pool := testPool(t)
	repo := NewSessionRepository(pool)
	ctx := context.Background()

	// Create multiple sessions for same user
	for i := 0; i < 3; i++ {
		_, err := repo.Create(ctx, "user-4", randomToken(), "127.0.0.1", "TestAgent", 24*time.Hour)
		require.NoError(t, err)
	}

	count, err := repo.DeleteByUserID(ctx, "user-4")
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, int64(3), "should delete at least 3 sessions")
}

func TestSessionCleanupExpired(t *testing.T) {
	pool := testPool(t)
	repo := NewSessionRepository(pool)
	ctx := context.Background()

	// Create an already-expired session (TTL of -1 hour)
	token := randomToken()
	_, err := repo.Create(ctx, "user-5", token, "127.0.0.1", "TestAgent", -1*time.Hour)
	require.NoError(t, err)

	count, err := repo.CleanupExpired(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, int64(1), "should clean up at least 1 expired session")

	// Expired session should no longer be retrievable
	_, err = repo.GetByToken(ctx, token)
	assert.Error(t, err)
}

// --- Migration idempotency test ---

func TestMigrations_Idempotent(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	ctx := context.Background()

	// Run migrations twice — should not error
	err := RunMigrations(ctx, dbURL, migrations.FS)
	require.NoError(t, err, "first migration run should succeed")

	err = RunMigrations(ctx, dbURL, migrations.FS)
	require.NoError(t, err, "second migration run should be idempotent")
}
