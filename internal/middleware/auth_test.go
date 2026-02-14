package middleware

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pandasWhoCode/paintbar/internal/service"
	"github.com/stretchr/testify/assert"
)

// mockTokenVerifier implements TokenVerifier for testing.
type mockTokenVerifier struct {
	user *service.UserInfo
	err  error
}

func (m *mockTokenVerifier) VerifyIDToken(_ context.Context, _ string) (*service.UserInfo, error) {
	return m.user, m.err
}

func TestAuth_SkipsHealthEndpoint(t *testing.T) {
	// Auth middleware with nil authService — should never be called for skipped paths
	handler := Auth(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code, "health endpoint should skip auth")
}

func TestAuth_SkipsRootPath(t *testing.T) {
	handler := Auth(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code, "root path should skip auth")
}

func TestAuth_SkipsStaticAssets(t *testing.T) {
	handler := Auth(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/static/css/style.css", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code, "static assets should skip auth")
}

func TestAuth_RejectsMissingHeader(t *testing.T) {
	authSvc := &service.AuthService{} // won't be called
	handler := Auth(authSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "missing authorization header")
}

func TestAuth_RejectsInvalidFormat(t *testing.T) {
	authSvc := &service.AuthService{}
	handler := Auth(authSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Basic abc123")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid authorization header format")
}

func TestAuth_RejectsEmptyToken(t *testing.T) {
	authSvc := &service.AuthService{}
	handler := Auth(authSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer ")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "empty token")
}

func TestAuth_SkipsFavicon(t *testing.T) {
	handler := Auth(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/favicon.ico", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code, "favicon should skip auth")
}

func TestUserFromContext_NilWhenNotSet(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	user := UserFromContext(req.Context())
	assert.Nil(t, user, "should return nil when no user in context")
}

func TestUserFromContext_ReturnsUser(t *testing.T) {
	userInfo := &service.UserInfo{UID: "user1", Email: "a@b.com"}
	ctx := context.WithValue(context.Background(), UserContextKey, userInfo)
	user := UserFromContext(ctx)
	assert.NotNil(t, user)
	assert.Equal(t, "user1", user.UID)
	assert.Equal(t, "a@b.com", user.Email)
}

func TestExtractIP_PrefersRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	req.Header.Set("X-Real-IP", "1.2.3.4")
	ip := extractIP(req)
	// RemoteAddr is non-loopback, so X-Real-IP is ignored
	assert.Equal(t, "10.0.0.1", ip)
}

func TestExtractIP_LoopbackFallsBackToXRealIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("X-Real-IP", "1.2.3.4")
	ip := extractIP(req)
	assert.Equal(t, "1.2.3.4", ip)
}

func TestExtractIP_IPv6LoopbackFallsBackToXRealIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "::1:12345"
	req.Header.Set("X-Real-IP", "1.2.3.4")
	ip := extractIP(req)
	assert.Equal(t, "1.2.3.4", ip)
}

func TestExtractIP_FallbackRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "5.6.7.8:12345"
	ip := extractIP(req)
	assert.Equal(t, "5.6.7.8", ip)
}

func TestExtractIP_NoPort(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "5.6.7.8"
	ip := extractIP(req)
	assert.Equal(t, "5.6.7.8", ip)
}

func TestAuth_SuccessfulTokenVerification(t *testing.T) {
	verifier := &mockTokenVerifier{
		user: &service.UserInfo{UID: "user1", Email: "a@b.com"},
	}

	var capturedUser *service.UserInfo
	handler := Auth(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NotNil(t, capturedUser)
	assert.Equal(t, "user1", capturedUser.UID)
	assert.Equal(t, "a@b.com", capturedUser.Email)
}

func TestAuth_FailedTokenVerification(t *testing.T) {
	verifier := &mockTokenVerifier{
		err: fmt.Errorf("token expired"),
	}

	handler := Auth(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer expired-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid or expired token")
}

func TestAuth_NilAuthService_Returns500(t *testing.T) {
	handler := Auth(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer some-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "authentication service unavailable")
}

func TestAuth_SingleWordAuth(t *testing.T) {
	verifier := &mockTokenVerifier{}
	handler := Auth(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "justoneword")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid authorization header format")
}
