# Testing

[← Deployment](deployment.md) · [Docs Index](README.md) · [Menu Reference →](menus.md)

## Test Strategy

PaintBar uses a layered testing approach:

| Layer          | Framework                         | What's Tested                                            |
| -------------- | --------------------------------- | -------------------------------------------------------- |
| **Model**      | Go `testing` + testify            | Struct validation, sanitization, update maps             |
| **Service**    | Go `testing` + testify            | Business logic with mock repositories                    |
| **Handler**    | Go `testing` + testify + httptest | HTTP request/response, JSON encoding, error mapping      |
| **Middleware** | Go `testing` + testify + httptest | Auth, rate limiting, CORS, security headers, recovery    |
| **Repository** | Go `testing` + testify            | Firestore operations (requires emulator for integration) |
| **Config**     | Go `testing` + testify            | Environment variable loading + validation                |

## Running Tests

### All Tests

```bash
task test
# Equivalent to: go test ./... -v -race
```

### Short Tests (Skip Integration)

```bash
task test-short
# Equivalent to: go test ./... -v -short
```

### Single Package

```bash
go test ./internal/handler/ -v -race
go test ./internal/middleware/ -v -race -run TestAuth
```

### With Coverage

```bash
go test ./... -coverprofile=coverage.out -covermode=atomic
go tool cover -html=coverage.out -o coverage.html
```

### Benchmarks

```bash
task bench
# Equivalent to: go test ./... -bench=. -benchmem -run=^$ -count=1
```

### Linting

```bash
task lint:go       # Go vet
task lint:ts       # TypeScript type checking (tsc --noEmit)
task lint:md       # Markdown linting (markdownlint)
task lint:all      # Run all three
task lint-fix:all  # Auto-fix Markdown + TypeScript (Prettier)
```

---

## Test Organization

### Handler Tests (`internal/handler/handler_test.go`)

The handler test file is the largest test file, covering all API endpoints. Key patterns:

```go
// Mock service for testing
type mockUserService struct {
    getProfileFn    func(ctx context.Context, uid string) (*model.User, error)
    updateProfileFn func(ctx context.Context, reqUID, targetUID string, update *model.UserUpdate) error
    claimUsernameFn func(ctx context.Context, uid, username string) error
}

// Test helper: create authenticated request
func authenticatedRequest(method, path string, body io.Reader) *http.Request {
    req := httptest.NewRequest(method, path, body)
    ctx := context.WithValue(req.Context(), middleware.UserContextKey, &service.UserInfo{
        UID:   "test-uid",
        Email: "test@example.com",
    })
    return req.WithContext(ctx)
}
```

**What's tested**:

- All CRUD endpoints (profile, projects, gallery, NFTs)
- Authentication requirement (401 when no user in context)
- Input validation (400 for bad JSON, missing fields, invalid values)
- Error mapping (404, 409, 403, 500)
- Pagination parameters
- Request body size limits (413)
- Docs handler (Swagger UI, OpenAPI spec, init.js)
- Template renderer (success, missing template, broken template)
- Page handlers (login, profile, canvas, 404)

### Middleware Tests (`internal/middleware/middleware_test.go`)

```go
// Mock token verifier
type mockTokenVerifier struct {
    verifyFn func(ctx context.Context, token string) (*service.UserInfo, error)
}
```

**What's tested**:

- Auth middleware: skip paths, valid token, invalid token, missing header, nil auth service
- Rate limiter: allow/deny, window reset, cleanup, Close method
- Sensitive endpoint rate limiter
- IP extraction: `RemoteAddr` preference, `X-Real-IP` fallback for loopback only
- Security headers (CSP, HSTS, X-Frame-Options)
- CORS configuration
- Recovery middleware (panic handling)
- Request logging

### Service Tests (`internal/service/service_test.go`)

Uses mock repositories defined in `mock_repos_test.go`:

```go
type mockUserRepo struct {
    getByIDFn       func(ctx context.Context, uid string) (*model.User, error)
    createFn        func(ctx context.Context, user *model.User) error
    updateFn        func(ctx context.Context, uid string, update *model.UserUpdate) error
    claimUsernameFn func(ctx context.Context, uid, username string) error
}
```

**What's tested**:

- Profile CRUD with validation
- Username claiming (format validation, already-set check, atomicity)
- Input sanitization (trimming, handle normalization)
- Authorization checks (can't update another user's profile)
- Project/gallery/NFT CRUD with ownership enforcement
- `UploadBlob` — PNG magic byte validation (valid, invalid, short body), auth, storage errors
- NFT blockchain field zeroing (`tokenId`, `serialNumber`, `transactionId` cleared on create)

### Model Tests (`internal/model/model_test.go`)

**What's tested**:

- Field validation (required fields, max lengths, URL format)
- Username regex validation
- Sanitization (whitespace trimming, handle @ stripping)
- `ToUpdateMap()` — only non-nil fields included, `updatedAt` always set

### Repository Tests (`internal/repository/repository_test.go`)

**What's tested**:

- Helper function unit tests (isNotFoundError, contains, searchString)
- FirebaseClients Close method
- Error handling for not-found documents

---

## Test Patterns

### Interface-Driven Mocking

All repositories define interfaces, enabling mock-based unit testing without external dependencies:

```go
// Repository interface
type UserRepository interface {
    GetByID(ctx context.Context, uid string) (*model.User, error)
    Create(ctx context.Context, user *model.User) error
    Update(ctx context.Context, uid string, update *model.UserUpdate) error
    ClaimUsername(ctx context.Context, uid string, username string) error
}

// Mock implementation in tests
type mockUserRepo struct {
    getByIDFn func(...) (*model.User, error)
    // ...
}
func (m *mockUserRepo) GetByID(ctx context.Context, uid string) (*model.User, error) {
    return m.getByIDFn(ctx, uid)
}
```

### httptest Pattern

Handler tests use `httptest.NewRecorder()` and `httptest.NewRequest()`:

```go
func TestGetProfile(t *testing.T) {
    handler := NewProfileHandler(mockService)
    req := authenticatedRequest("GET", "/api/profile", nil)
    rr := httptest.NewRecorder()

    handler.GetProfile(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    // ... assert response body
}
```

### Rate Limiter Cleanup

Rate limiter tests must call `defer rl.Close()` to stop the background cleanup goroutine and prevent goroutine leaks:

```go
func TestRateLimiter(t *testing.T) {
    rl := NewRateLimiter(5, time.Minute)
    defer rl.Close()
    // ... test
}
```

---

## Security Testing

### Recommended Checks

```bash
# Go vulnerability check
govulncheck ./...

# npm audit
npm audit

# OWASP considerations covered by middleware and service layer:
# - CSP headers (XSS prevention)
# - X-Frame-Options: DENY (clickjacking)
# - X-Content-Type-Options: nosniff (MIME sniffing)
# - Rate limiting (brute force) with IP spoofing prevention
# - Request body size limits (DoS)
# - Input sanitization (injection)
# - HSTS in production (downgrade attacks)
# - PNG magic byte validation (content-type spoofing)
# - data:image/ prefix enforcement on imageData fields
# - DisallowUnknownFields on JSON decoder (mass assignment)
# - Content-Disposition on blob downloads (content sniffing)
# - Structured localStorage caching (stored XSS prevention)
# - Server-managed storageURL (Firestore rules + service layer)
# - NFT blockchain field zeroing (fake metadata prevention)
```

---

## TypeScript Type Checking

TypeScript is type-checked separately from the esbuild build:

```bash
task ts-check
# Equivalent to: npx tsc --project web/ts/tsconfig.json --noEmit
```

This catches type errors without producing output files (esbuild handles bundling).

---

[← Deployment](deployment.md) · [Docs Index](README.md) · [Menu Reference →](menus.md)
