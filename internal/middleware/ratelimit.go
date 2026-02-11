package middleware

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

// RateLimiter implements an in-memory token bucket rate limiter.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int           // max requests per window
	window   time.Duration // window duration
	cleanup  time.Duration // how often to purge expired entries
	done     chan struct{} // signals cleanupLoop to stop
}

type visitor struct {
	count       int
	windowStart time.Time
}

// NewRateLimiter creates a new in-memory rate limiter.
// rate is the max number of requests allowed per window duration.
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		window:   window,
		cleanup:  window * 2,
		done:     make(chan struct{}),
	}

	go rl.cleanupLoop()

	return rl
}

// Close stops the background cleanup goroutine.
func (rl *RateLimiter) Close() {
	close(rl.done)
}

// Handler returns middleware that enforces the rate limit.
// Skips static asset requests.
func (rl *RateLimiter) Handler() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip rate limiting for static assets and health checks
			if strings.HasPrefix(r.URL.Path, "/static/") || r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}

			key := extractIP(r)
			if !rl.allow(key) {
				slog.Warn("rate limit exceeded",
					"ip", key,
					"path", r.URL.Path,
				)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "rate limit exceeded, please try again later",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// allow checks whether the given key is within the rate limit.
func (rl *RateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	v, exists := rl.visitors[key]

	if !exists || now.Sub(v.windowStart) >= rl.window {
		rl.visitors[key] = &visitor{count: 1, windowStart: now}
		return true
	}

	if v.count >= rl.rate {
		return false
	}

	v.count++
	return true
}

// cleanupLoop periodically removes expired visitor entries.
// Coverage: defer ticker.Stop() is unreachable — this goroutine runs for the
// lifetime of the process. The actual cleanup logic is tested via purgeExpired.
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for {
		select {
		case <-rl.done:
			return
		case <-ticker.C:
			rl.purgeExpired()
		}
	}
}

// purgeExpired removes all visitor entries whose window has expired.
func (rl *RateLimiter) purgeExpired() {
	rl.mu.Lock()
	now := time.Now()
	for key, v := range rl.visitors {
		if now.Sub(v.windowStart) >= rl.window {
			delete(rl.visitors, key)
		}
	}
	rl.mu.Unlock()
}

// SensitiveEndpoint returns middleware that applies a stricter rate limit
// to sensitive endpoints like username claiming. It uses a separate limiter
// instance so it doesn't share the global budget.
func SensitiveEndpoint(rl *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := extractIP(r)
			if !rl.allow(key) {
				slog.Warn("sensitive endpoint rate limit exceeded",
					"ip", key,
					"path", r.URL.Path,
				)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "too many attempts, please try again later",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// extractIP gets the client IP, preferring X-Real-IP (set by chi's RealIP middleware).
func extractIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	// Fallback: strip port from RemoteAddr
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}
