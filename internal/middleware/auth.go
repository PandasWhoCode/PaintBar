package middleware

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/pandasWhoCode/paintbar/internal/service"
)

// TokenVerifier verifies an ID token and returns user info.
type TokenVerifier interface {
	VerifyIDToken(ctx context.Context, idToken string) (*service.UserInfo, error)
}

// contextKey is an unexported type for context keys in this package.
type contextKey string

const (
	// UserContextKey is the context key for the authenticated user info.
	UserContextKey contextKey = "user"
)

// Auth returns middleware that verifies Firebase ID tokens from the
// Authorization header. Requests to paths in the skip list are passed through
// without authentication.
func Auth(authService TokenVerifier) func(http.Handler) http.Handler {
	// Paths that skip authentication entirely
	skipPaths := map[string]bool{
		"/":            true,
		"/health":      true,
		"/favicon.ico": true,
	}

	// Prefixes that skip authentication
	skipPrefixes := []string{
		"/static/",
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for whitelisted paths
			if skipPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			// Skip auth for whitelisted prefixes
			for _, prefix := range skipPrefixes {
				if strings.HasPrefix(r.URL.Path, prefix) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Extract Bearer token
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				unauthorizedJSON(w, "missing authorization header")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				unauthorizedJSON(w, "invalid authorization header format")
				return
			}

			idToken := parts[1]
			if idToken == "" {
				unauthorizedJSON(w, "empty token")
				return
			}

			// Verify token with Firebase
			userInfo, err := authService.VerifyIDToken(r.Context(), idToken)
			if err != nil {
				slog.Warn("token verification failed",
					"error", err,
					"path", r.URL.Path,
					"ip", r.RemoteAddr,
				)
				unauthorizedJSON(w, "invalid or expired token")
				return
			}

			// Inject user info into context
			ctx := context.WithValue(r.Context(), UserContextKey, userInfo)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserFromContext extracts the authenticated UserInfo from the request context.
// Returns nil if no user is authenticated.
func UserFromContext(ctx context.Context) *service.UserInfo {
	user, _ := ctx.Value(UserContextKey).(*service.UserInfo)
	return user
}

// unauthorizedJSON writes a 401 JSON error response.
func unauthorizedJSON(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}
