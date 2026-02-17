package middleware

import (
	"net/http"
)

// SecurityHeaders returns middleware that sets security-related HTTP headers.
// Applies CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
// Permissions-Policy, X-XSS-Protection, and HSTS (production only).
func SecurityHeaders(env string) func(http.Handler) http.Handler {
	csp := buildCSP(env)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()

			// Prevent clickjacking
			h.Set("X-Frame-Options", "DENY")

			// Prevent MIME-type sniffing
			h.Set("X-Content-Type-Options", "nosniff")

			// Disable legacy XSS filter (rely on CSP instead)
			h.Set("X-XSS-Protection", "0")

			// Control referrer information
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")

			// Restrict browser features
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

			// Content Security Policy
			h.Set("Content-Security-Policy", csp)

			// HSTS — only in production (behind TLS)
			if env == "production" {
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
			}

			next.ServeHTTP(w, r)
		})
	}
}

// buildCSP constructs the Content-Security-Policy header value.
// In local/preview environments, additional sources are allowed for
// emulators and development tools (Swagger UI).
func buildCSP(env string) string {
	// 'unsafe-eval' is required by the Firebase JS SDK's persistentLocalCache
	// (IndexedDB via IDB library uses Function() constructor internally).
	scriptSrc := "'self' 'unsafe-eval' https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://www.googletagmanager.com"
	connectSrc := "'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.google-analytics.com https://www.googletagmanager.com"

	if env != "production" {
		// Allow Swagger UI CDN
		scriptSrc += " https://unpkg.com"
		// Allow connections to local emulators
		connectSrc += " http://localhost:* http://127.0.0.1:*"
	}

	return "default-src 'self'; " +
		"script-src " + scriptSrc + "; " +
		"style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://unpkg.com; " +
		"font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
		"img-src 'self' data: blob: https://gravatar.com; " +
		"connect-src " + connectSrc + "; " +
		"frame-src https://*.firebaseapp.com; " +
		"object-src 'none'; " +
		"base-uri 'self'"
}
