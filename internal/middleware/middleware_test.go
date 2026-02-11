package middleware

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// helper: create a simple OK handler
func okHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}
}

// helper: create a panicking handler
func panicHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	}
}

// --- RequestLogger tests ---

func TestRequestLogger_LogsRequest(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(RequestLogger(logger))
	r.Get("/test", okHandler())

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "ok", rr.Body.String())
}

// helper: create a handler that returns a specific status code
func statusHandler(code int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(code)
	}
}

func TestRequestLogger_4xxLogsWarn(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(RequestLogger(logger))
	r.Get("/notfound", statusHandler(http.StatusNotFound))

	req := httptest.NewRequest(http.MethodGet, "/notfound", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestRequestLogger_5xxLogsError(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(RequestLogger(logger))
	r.Get("/error", statusHandler(http.StatusInternalServerError))

	req := httptest.NewRequest(http.MethodGet, "/error", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

// --- SecurityHeaders tests ---

func TestSecurityHeaders_SetsAllHeaders(t *testing.T) {
	handler := SecurityHeaders("local")(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, "DENY", rr.Header().Get("X-Frame-Options"))
	assert.Equal(t, "nosniff", rr.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "strict-origin-when-cross-origin", rr.Header().Get("Referrer-Policy"))
	assert.Contains(t, rr.Header().Get("Content-Security-Policy"), "default-src 'self'")
	assert.Contains(t, rr.Header().Get("Permissions-Policy"), "camera=()")
	// HSTS should NOT be set for local
	assert.Empty(t, rr.Header().Get("Strict-Transport-Security"))
}

func TestSecurityHeaders_HSTSInProduction(t *testing.T) {
	handler := SecurityHeaders("production")(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Contains(t, rr.Header().Get("Strict-Transport-Security"), "max-age=63072000")
}

// --- RateLimiter tests ---

func TestRateLimiter_AllowsUnderLimit(t *testing.T) {
	rl := NewRateLimiter(5, time.Minute)
	handler := rl.Handler()(okHandler())

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "request %d should be allowed", i+1)
	}
}

func TestRateLimiter_BlocksOverLimit(t *testing.T) {
	rl := NewRateLimiter(3, time.Minute)
	handler := rl.Handler()(okHandler())

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	}

	// 4th request should be blocked
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusTooManyRequests, rr.Code)
	assert.Equal(t, "60", rr.Header().Get("Retry-After"))

	var body map[string]string
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Contains(t, body["error"], "rate limit exceeded")
}

func TestRateLimiter_SkipsStaticAssets(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	handler := rl.Handler()(okHandler())

	// First non-static request uses the one allowed
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = "10.0.0.2:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	// Static requests should always pass even though limit is exhausted
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/static/styles/main.css", nil)
		req.RemoteAddr = "10.0.0.2:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "static request %d should not be rate limited", i+1)
	}
}

func TestRateLimiter_SkipsHealthEndpoint(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	handler := rl.Handler()(okHandler())

	// Exhaust the limit
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = "10.0.0.50:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	// /health should still pass even though limit is exhausted
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.RemoteAddr = "10.0.0.50:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "/health request %d should not be rate limited", i+1)
	}
}

func TestRateLimiter_DifferentIPsIndependent(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	handler := rl.Handler()(okHandler())

	// IP 1
	req1 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req1.RemoteAddr = "1.1.1.1:12345"
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)
	assert.Equal(t, http.StatusOK, rr1.Code)

	// IP 2 — should still be allowed
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.RemoteAddr = "2.2.2.2:12345"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusOK, rr2.Code)
}

// --- SensitiveEndpoint tests ---

func TestSensitiveEndpoint_BlocksAfterLimit(t *testing.T) {
	rl := NewRateLimiter(5, time.Minute) // 5 req/min — aggressive
	handler := SensitiveEndpoint(rl)(okHandler())

	// 5 requests should pass
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/claim-username", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "request %d should pass", i+1)
	}

	// 6th should be blocked
	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusTooManyRequests, rr.Code)
	assert.Equal(t, "60", rr.Header().Get("Retry-After"))

	var body map[string]string
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Contains(t, body["error"], "too many attempts")
}

func TestSensitiveEndpoint_IndependentFromGlobal(t *testing.T) {
	globalRL := NewRateLimiter(100, time.Minute)
	sensitiveRL := NewRateLimiter(2, time.Minute)

	// Exhaust the sensitive limiter
	sensitiveHandler := SensitiveEndpoint(sensitiveRL)(okHandler())
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/claim-username", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		sensitiveHandler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	}

	// Sensitive should be blocked
	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	sensitiveHandler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusTooManyRequests, rr.Code)

	// Global should still allow
	globalHandler := globalRL.Handler()(okHandler())
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.RemoteAddr = "10.0.0.1:12345"
	rr2 := httptest.NewRecorder()
	globalHandler.ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusOK, rr2.Code, "global limiter should be unaffected")
}

// --- CORS tests ---

func TestCORS_AllowedOrigin(t *testing.T) {
	cfg := DefaultCORSConfig("local")
	handler := CORS(cfg)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:8080")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, "http://localhost:8080", rr.Header().Get("Access-Control-Allow-Origin"))
	assert.NotEmpty(t, rr.Header().Get("Access-Control-Allow-Methods"))
}

func TestCORS_DisallowedOrigin(t *testing.T) {
	cfg := DefaultCORSConfig("production")
	handler := CORS(cfg)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Empty(t, rr.Header().Get("Access-Control-Allow-Origin"))
}

func TestCORS_PreflightReturns204(t *testing.T) {
	cfg := DefaultCORSConfig("local")
	handler := CORS(cfg)(okHandler())

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:8080")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestCORS_NoOriginHeader(t *testing.T) {
	cfg := DefaultCORSConfig("local")
	handler := CORS(cfg)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Empty(t, rr.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestCORS_ProductionAllowedOrigin(t *testing.T) {
	cfg := DefaultCORSConfig("production")
	handler := CORS(cfg)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://paintbar.art")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, "https://paintbar.art", rr.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "Origin", rr.Header().Get("Vary"))
	assert.NotEmpty(t, rr.Header().Get("Access-Control-Max-Age"))
}

func TestCORS_PreflightDisallowedOrigin(t *testing.T) {
	cfg := DefaultCORSConfig("production")
	handler := CORS(cfg)(okHandler())

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
	assert.Empty(t, rr.Header().Get("Access-Control-Allow-Origin"))
}

func TestRateLimiter_WindowReset(t *testing.T) {
	// Use a very short window so it resets during the test
	rl := NewRateLimiter(1, 50*time.Millisecond)
	handler := rl.Handler()(okHandler())

	// First request — allowed
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = "10.0.0.99:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	// Second request — blocked
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.RemoteAddr = "10.0.0.99:12345"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusTooManyRequests, rr2.Code)

	// Wait for window to expire
	time.Sleep(60 * time.Millisecond)

	// Third request — allowed again after window reset
	req3 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req3.RemoteAddr = "10.0.0.99:12345"
	rr3 := httptest.NewRecorder()
	handler.ServeHTTP(rr3, req3)
	assert.Equal(t, http.StatusOK, rr3.Code)
}

func TestRateLimiter_PurgeExpired(t *testing.T) {
	rl := &RateLimiter{
		visitors: map[string]*visitor{
			"expired": {count: 5, windowStart: time.Now().Add(-2 * time.Minute)},
			"active":  {count: 1, windowStart: time.Now()},
		},
		rate:   10,
		window: time.Minute,
	}

	rl.purgeExpired()

	assert.Len(t, rl.visitors, 1)
	assert.Contains(t, rl.visitors, "active")
	assert.NotContains(t, rl.visitors, "expired")
}

func TestRateLimiter_PurgeExpired_NoneExpired(t *testing.T) {
	rl := &RateLimiter{
		visitors: map[string]*visitor{
			"a": {count: 1, windowStart: time.Now()},
			"b": {count: 2, windowStart: time.Now()},
		},
		rate:   10,
		window: time.Minute,
	}

	rl.purgeExpired()

	assert.Len(t, rl.visitors, 2)
}

// --- Recovery tests ---

func TestRecovery_CatchesPanic(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handler := Recovery(logger)(panicHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)

	var body map[string]string
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, "internal server error", body["error"])
}

func TestRecovery_PassesThroughNormally(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handler := Recovery(logger)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "ok", rr.Body.String())
}
