package middleware

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pandasWhoCode/paintbar/internal/repository"
)

// noopHandler is a minimal handler for benchmarking middleware overhead.
var noopHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})

// silentLogger suppresses log output during benchmarks.
var silentLogger = slog.New(slog.NewTextHandler(io.Discard, nil))

func BenchmarkRequestLogger(b *testing.B) {
	handler := RequestLogger(silentLogger)(noopHandler)
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("X-Real-IP", "10.0.0.1")

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkSecurityHeaders(b *testing.B) {
	handler := SecurityHeaders("production")(noopHandler)
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkRecovery(b *testing.B) {
	handler := Recovery(silentLogger)(noopHandler)
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkRateLimiter_Allow(b *testing.B) {
	rl := NewRateLimiter(999999999, time.Minute) // effectively unlimited so we measure overhead only
	handler := rl.Handler()(noopHandler)
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("X-Real-IP", "10.0.0.1")

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkRateLimiter_ManyIPs(b *testing.B) {
	rl := NewRateLimiter(100, time.Minute)
	handler := rl.Handler()(noopHandler)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
			req.Header.Set("X-Real-IP", fmt.Sprintf("10.0.%d.%d", (i/256)%256, i%256))
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			i++
		}
	})
}

func BenchmarkCORS(b *testing.B) {
	cfg := CORSConfig{
		AllowedOrigins: []string{"https://paintbar.art", "https://app.paintbar.art"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
	}
	handler := CORS(cfg)(noopHandler)
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://paintbar.art")

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkSensitiveEndpoint(b *testing.B) {
	rl := NewRateLimiter(999999999, time.Minute) // effectively unlimited
	handler := SensitiveEndpoint(rl)(noopHandler)
	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", nil)
	req.Header.Set("X-Real-IP", "10.0.0.1")

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkFullMiddlewareStack(b *testing.B) {
	rl := NewRateLimiter(999999999, time.Minute)
	handler := Recovery(silentLogger)(
		SecurityHeaders("production")(
			RequestLogger(silentLogger)(
				rl.Handler()(noopHandler),
			),
		),
	)
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("X-Real-IP", "10.0.0.1")

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
		}
	})
}

func BenchmarkHashToken(b *testing.B) {
	token := "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.test"
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			repository.HashToken(token)
		}
	})
}
