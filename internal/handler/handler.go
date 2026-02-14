package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/pandasWhoCode/paintbar/internal/middleware"
	"github.com/pandasWhoCode/paintbar/internal/service"
)

// respondJSON writes a JSON response with the given status code.
// Sets Cache-Control: no-store to prevent caching of authenticated data.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

// respondError writes a JSON error response. Maps known error patterns
// to appropriate HTTP status codes. For 500 errors, the real error is
// logged server-side but a generic message is returned to the client
// to prevent leaking internal details.
func respondError(w http.ResponseWriter, err error) {
	msg := err.Error()
	status := errorStatus(msg)

	slog.Warn("handler error",
		"status", status,
		"error", msg,
	)

	clientMsg := msg
	if status == http.StatusInternalServerError {
		clientMsg = "internal server error"
	}

	respondJSON(w, status, map[string]string{"error": clientMsg})
}

// errorStatus maps error message patterns to HTTP status codes.
func errorStatus(msg string) int {
	lower := strings.ToLower(msg)

	switch {
	case strings.Contains(lower, "unauthorized"):
		return http.StatusForbidden
	case strings.Contains(lower, "not found"),
		strings.Contains(lower, "doesn't exist"),
		strings.Contains(lower, "does not exist"):
		return http.StatusNotFound
	case strings.Contains(lower, "already taken"),
		strings.Contains(lower, "already set"),
		strings.Contains(lower, "already exists"):
		return http.StatusConflict
	case strings.Contains(lower, "is required"),
		strings.Contains(lower, "validation"),
		strings.Contains(lower, "must be"),
		strings.Contains(lower, "invalid"):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// requireUser extracts the authenticated user from the request context.
// Returns nil and writes a 401 response if no user is present.
func requireUser(w http.ResponseWriter, r *http.Request) *service.UserInfo {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "authentication required",
		})
		return nil
	}
	return user
}

// parsePagination extracts limit and startAfter query parameters.
func parsePagination(r *http.Request) (limit int, startAfter string) {
	if v := r.URL.Query().Get("limit"); v != "" {
		limit, _ = strconv.Atoi(v)
	}
	startAfter = r.URL.Query().Get("startAfter")
	return
}

// maxRequestBodySize is the maximum allowed request body size (1 MB).
const maxRequestBodySize = 1 << 20

// decodeJSON reads and decodes a JSON request body into dst.
// Limits the body to maxRequestBodySize to prevent memory exhaustion.
// Returns false and writes a 400 response on failure.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst interface{}) bool {
	if r.Body == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "request body is required",
		})
		return false
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		if strings.Contains(err.Error(), "http: request body too large") {
			respondJSON(w, http.StatusRequestEntityTooLarge, map[string]string{
				"error": "request body too large",
			})
			return false
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid JSON",
		})
		return false
	}
	return true
}
