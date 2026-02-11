# PaintBar: Vanilla JS → Go Migration Plan

## Architecture Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| **HTTP Server** | Go + `chi` router | Serves SSR pages + JSON API |
| **Templates** | Go `html/template` | Login, profile, canvas pages |
| **Client JS** | TypeScript (esbuild + tsc) | Canvas app + minimal fetch() clients |
| **Primary DB** | Firebase Firestore | Users, projects, gallery, NFTs |
| **Auth** | Firebase Auth (client) + Firebase Admin SDK (server) | Token verification on every API call |
| **SQL DB** | PostgreSQL (via `pgx/v5`) | Sessions, rate limits, audit logs |
| **Migrations** | Goose (`pressly/goose/v3`) | PostgreSQL schema management |
| **NFT Network** | Hiero Go SDK (`hiero-ledger/hiero-go-sdk`) | Token minting, transfers, marketplace |
| **NFT Local Testing** | Solo (`solo.hiero.org`) ≥ 0.54.0 | Local Hiero network for dev/test |
| **Testing** | `testing` + `testify` (`stretchr/testify`) | Go tests; Firebase Emulator + Solo for integration |
| **Task Runner** | Taskfile.yml (`taskfile.dev`) | Build, test, migrate, docker, deploy |
| **Logging** | `log/slog` (stdlib) | Structured request/app logging |
| **Local Dev** | Docker Compose | Go app + Postgres + Firebase Emulator + Solo |
| **Preview** | Firebase Hosting preview channel + Cloud Run | Same Docker image as local |
| **Production** | Firebase Hosting (CDN) + Cloud Run (Go) + Cloud SQL Postgres | Scales to zero |

### Version Constraints

| Dependency | Version |
|-----------|---------|
| **Go** | latest (1.23+) |
| **Node** | 24 (Firebase Emulator container) |
| **Solo (Hiero)** | ≥ 0.54.0 |
| **PostgreSQL** | 16 |
| **esbuild** | latest (via npm) |
| **tsc** | latest (via npm) |
| **Firebase JS SDK** | v11.2.0 (client) |
| **Firebase Admin SDK** | `firebase.google.com/go/v4` |

### UI Requirement

Keep as much of the look and feel of the profile page and paintbar canvas app as possible. CSS and visual design are preserved during migration. Go templates reproduce the existing HTML structure closely.

---

## Multi-Environment Strategy

```
┌──────────────────────────────────────────────────────────────────────┐
│                           ENVIRONMENTS                                │
├───────────────────┬────────────────────┬─────────────────────────────┤
│   LOCAL (Docker)   │  PREVIEW (Firebase) │  PRODUCTION (Firebase)     │
├───────────────────┼────────────────────┼─────────────────────────────┤
│ Go app container   │ Cloud Run container │ Cloud Run container        │
│                    │                     │                            │
│ Postgres container │ Cloud SQL Postgres  │ Cloud SQL Postgres         │
│ (port 5432)        │ (preview instance)  │ (production instance)      │
│                    │                     │                            │
│ Firebase Emulator  │ Firebase preview    │ Firebase production        │
│ - Auth (9099)      │ channel             │ project (paintbar-7f887)   │
│ - Firestore (8080) │ (paintbar-7f887)    │                            │
│ - UI (4000)        │                     │                            │
│                    │                     │                            │
│ Solo (Hiero local) │ Hiero testnet       │ Hiero mainnet              │
│ (port 50211)       │                     │                            │
│                    │                     │                            │
│ ENV=local          │ ENV=preview         │ ENV=production             │
│ Goose seeds test   │ Goose migrates on   │ Goose migrates via CI/CD   │
│ data               │ deploy              │                            │
└───────────────────┴────────────────────┴─────────────────────────────┘
```

### Cloud Run + Firebase Hosting Interaction (Preview & Prod)

```
                         User's Browser
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Firebase Hosting    │
                    │  (Global CDN)       │
                    │                     │
                    │  Serves directly:   │  ← CSS, JS bundles, images
                    │  • /static/**       │
                    │  • /favicon.ico     │
                    │                     │
                    │  Rewrites to        │
                    │  Cloud Run:         │
                    │  • /               │  ← Login page (Go template)
                    │  • /profile        │  ← Profile page (Go template)
                    │  • /canvas         │  ← Canvas page (Go template)
                    │  • /api/**         │  ← All API endpoints
                    └────────┬────────────┘
                             │ HTTPS rewrite
                             ▼
                    ┌─────────────────────┐
                    │  Cloud Run (Go)     │
                    │                     │
                    │  ┌───────────────┐  │
                    │  │ chi Router    │  │
                    │  │ + Middleware  │  │
                    │  └───────┬───────┘  │
                    │          │           │
                    │  ┌───────▼───────┐  │
                    │  │ Handlers      │  │
                    │  │ (API + Pages) │  │
                    │  └───┬───────┬───┘  │
                    │      │       │       │
                    │  ┌───▼──┐ ┌──▼────┐  │
                    │  │ Fire-│ │Cloud  │  │
                    │  │ store│ │SQL PG │  │
                    │  └──────┘ └───────┘  │
                    │      │               │
                    │  ┌───▼──────────┐    │
                    │  │ Hiero SDK    │    │
                    │  │ (NFT ops)    │    │
                    │  └──────────────┘    │
                    └─────────────────────┘
```

---

## Target Project Structure

```
paintbar/
├── cmd/
│   └── server/
│       └── main.go                     # Entry point, bootstrap, graceful shutdown
├── internal/
│   ├── config/
│   │   └── config.go                   # Multi-env config (local/preview/prod)
│   ├── middleware/
│   │   ├── auth.go                     # Firebase token verification
│   │   ├── ratelimit.go                # Postgres-backed rate limiting
│   │   ├── logging.go                  # slog request logging
│   │   ├── cors.go                     # CORS headers
│   │   ├── recovery.go                 # Panic recovery
│   │   ├── security.go                 # CSP, CSRF, secure headers
│   │   └── middleware_test.go
│   ├── handler/
│   │   ├── pages.go                    # SSR page handlers
│   │   ├── auth.go                     # POST /api/auth/session, logout
│   │   ├── profile.go                  # GET/PUT /api/profile
│   │   ├── projects.go                 # CRUD /api/projects
│   │   ├── gallery.go                  # GET/POST /api/gallery
│   │   ├── nfts.go                     # GET /api/nfts, mint, list
│   │   └── *_test.go
│   ├── service/
│   │   ├── auth.go                     # Token verification logic
│   │   ├── user.go                     # Profile business logic
│   │   ├── project.go                  # Project business logic
│   │   ├── gallery.go                  # Gallery business logic
│   │   ├── nft.go                      # NFT business logic (Hiero SDK)
│   │   └── *_test.go
│   ├── repository/
│   │   ├── firestore.go                # Firestore client init + wrapper
│   │   ├── postgres.go                 # pgx pool init + health check
│   │   ├── user.go                     # User Firestore CRUD
│   │   ├── project.go                  # Project Firestore CRUD
│   │   ├── gallery.go                  # Gallery Firestore CRUD
│   │   ├── nft.go                      # NFT Firestore CRUD
│   │   ├── session.go                  # Session Postgres CRUD
│   │   └── *_test.go
│   └── model/
│       ├── user.go                     # User struct + validation
│       ├── project.go                  # Project struct + validation
│       ├── gallery.go                  # Gallery struct + validation
│       └── nft.go                      # NFT struct + validation (Hiero types)
├── migrations/
│   ├── 001_create_sessions.sql
│   ├── 002_create_rate_limits.sql
│   └── 003_create_audit_logs.sql
├── web/
│   ├── templates/
│   │   ├── layouts/
│   │   │   └── base.html
│   │   ├── pages/
│   │   │   ├── login.html
│   │   │   ├── profile.html
│   │   │   └── canvas.html
│   │   └── partials/
│   │       ├── nav.html
│   │       └── footer.html
│   ├── static/
│   │   ├── images/                     # Migrated from public/images/
│   │   ├── styles/                     # Migrated from public/styles/
│   │   └── dist/                       # esbuild + tsc output
│   └── ts/
│       ├── canvas/
│       │   ├── app.ts
│       │   ├── canvasManager.ts
│       │   ├── toolManager.ts
│       │   ├── basicTools.ts
│       │   ├── objectTools.ts
│       │   ├── actionTools.ts
│       │   ├── genericTool.ts
│       │   └── save.ts
│       ├── profile/
│       │   └── profile.ts             # fetch()-based profile client
│       ├── auth/
│       │   └── login.ts               # Firebase Auth client + session POST
│       └── tsconfig.json
├── testdata/
│   └── firestore/                      # Firebase Emulator seed data
├── Dockerfile                          # Multi-stage: Go build + esbuild + tsc + runtime
├── docker-compose.yml                  # app + postgres + firebase-emulator + solo
├── Taskfile.yml                        # Task runner targets
├── firebase.json                       # Hosting rewrites to Cloud Run
├── firestore.rules                     # Firestore security rules
├── firestore.indexes.json              # Firestore composite indexes
├── go.mod
├── go.sum
├── .env.example                        # All env vars documented
├── .gitignore                          # Updated for Go/TS/Docker
└── docs/
    ├── migration-plan.md               # Reference copy of this plan
    └── database-schema.md              # Updated schema docs
```

---

## Phase 0 — Scaffolding & Tooling

**Goal**: Project structure, all dependencies, Docker, Taskfile — `task dev` runs a server.

- Initialize Go module: `go mod init github.com/pandasWhoCode/paintbar`
- Add Go dependencies:
  - `github.com/go-chi/chi/v5` (router)
  - `github.com/jackc/pgx/v5` (Postgres)
  - `github.com/pressly/goose/v3` (migrations)
  - `github.com/stretchr/testify` (testing)
  - `firebase.google.com/go/v4` (Firebase Admin SDK)
  - `google.golang.org/api` (Google API client)
  - `github.com/hiero-ledger/hiero-go-sdk` (NFT — added to go.mod, not used until Phase 4+)
- Create full directory structure (all dirs listed above)
- Create `Taskfile.yml`:
  - `task build` — compile Go binary
  - `task run` — run dev server
  - `task test` — run all Go tests
  - `task migrate` / `task migrate-down` / `task migrate-status` — Goose
  - `task ts-build` — esbuild + tsc TypeScript compilation
  - `task dev` — run server + watch TS
  - `task docker-up` / `task docker-down` — Docker Compose
  - `task deploy-preview` — Firebase preview channel + Cloud Run
  - `task deploy-prod` — Production deploy
  - `task lint` — Go vet + staticcheck
- Create `Dockerfile` (multi-stage):
  - Stage 1: Go build (`golang:1.23-alpine`)
  - Stage 2: esbuild + tsc TS build (`node:24-alpine` with esbuild + tsc)
  - Stage 3: Runtime (`alpine:latest` — minimal, just the binary + static assets)
- Create `docker-compose.yml` (4 services):
  - `app` — Go server (builds from Dockerfile, depends on postgres + firebase + solo)
  - `postgres` — PostgreSQL 16 (health check, persistent volume, init script)
  - `firebase` — Firebase Emulator Suite (Node 24 with firebase-tools, Auth + Firestore)
  - `solo` — Hiero Solo ≥ 0.54.0 local network (for NFT testing)
- Create `.env.example` with all env vars:
  ```
  ENV=local
  PORT=8080
  DATABASE_URL=postgres://paintbar:paintbar@localhost:5432/paintbar?sslmode=disable
  FIREBASE_PROJECT_ID=paintbar-7f887
  FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
  FIRESTORE_EMULATOR_HOST=localhost:8080
  FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
  HIERO_NETWORK=local
  HIERO_OPERATOR_ID=
  HIERO_OPERATOR_KEY=
  ```
- Install TS dev deps: `npm install --save-dev typescript esbuild @types/node`, create `web/ts/tsconfig.json` (strict, ES2022, DOM lib)
- Update `.gitignore`: add `bin/`, `web/static/dist/`, `firebase-service-account.json`, `*.db`, Docker volumes, Go test cache
- **Tests**: `go build ./...` compiles, `task build` succeeds

---

## Phase 1 — Go Server Foundation

**Goal**: Running Go HTTP server with middleware, config, chi router, graceful shutdown.

- `internal/config/config.go`:
  - Config struct with all env vars
  - `Load()` function reads from environment
  - Environment detection: `local` → set emulator hosts, `preview`/`production` → use real Firebase
  - Validation: required fields checked per environment
- `cmd/server/main.go`:
  - Load config
  - Init Postgres connection pool
  - Init Firebase Admin app
  - Init Firestore client
  - Register chi routes
  - Start HTTP server with `context`-based graceful shutdown (`SIGINT`, `SIGTERM`)
- `internal/middleware/`:
  - `logging.go` — `slog` structured request logging (method, path, status, duration, IP)
  - `ratelimit.go` — Token bucket rate limiter (in-memory for Phase 1, Postgres-backed in Phase 2)
  - `cors.go` — CORS headers for API routes
  - `recovery.go` — Panic recovery → 500 JSON response
  - `security.go` — CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security
- Chi router setup:
  - `GET /` → login page handler
  - `GET /profile` → profile page handler
  - `GET /canvas` → canvas page handler
  - `GET /static/*` → `http.FileServer` for `web/static/`
  - `/api/*` group with auth middleware
- **Tests**: Server startup/shutdown, config loading, middleware ordering, 404 handling

---

## Phase 2 — PostgreSQL + Goose Migrations

**Goal**: Postgres connected, Goose migrations running, session/rate-limit/audit tables ready.

- `migrations/001_create_sessions.sql`:
  ```sql
  -- +goose Up
  CREATE TABLE sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      ip_address INET,
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
  -- +goose Down
  DROP TABLE sessions;
  ```
- `migrations/002_create_rate_limits.sql`:
  ```sql
  -- +goose Up
  CREATE TABLE rate_limits (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      request_count INT NOT NULL DEFAULT 1,
      UNIQUE(key, window_start)
  );
  CREATE INDEX idx_rate_limits_key_window ON rate_limits(key, window_start);
  -- +goose Down
  DROP TABLE rate_limits;
  ```
- `migrations/003_create_audit_logs.sql`:
  ```sql
  -- +goose Up
  CREATE TABLE audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details JSONB,
      ip_address INET,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
  CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
  -- +goose Down
  DROP TABLE audit_logs;
  ```
- `internal/repository/postgres.go` — `pgxpool` init, health check, connection retry
- `internal/repository/session.go` — `Create`, `GetByToken`, `DeleteByToken`, `DeleteByUserID`, `CleanupExpired`
- Update `internal/middleware/ratelimit.go` → Postgres-backed
- Goose embedded in `cmd/server/main.go` — auto-migrate on startup when `ENV=local`
- Taskfile: `task migrate`, `task migrate-down`, `task migrate-status`
- **Tests**: Migration up/down idempotency, session CRUD, rate limit logic, expired session cleanup

---

## Phase 3 — Firebase Admin SDK Integration

**Goal**: Go server verifies Firebase ID tokens and reads/writes Firestore.

- `internal/repository/firestore.go`:
  - `NewFirebaseApp()` — init Firebase Admin app
    - `ENV=local` → `option.WithoutAuthentication()` + emulator env vars
    - `ENV=preview/production` → `option.WithCredentialsFile(serviceAccountPath)`
  - `NewFirestoreClient()` — get Firestore client from Firebase app
  - Health check: ping Firestore
- `internal/service/auth.go`:
  - `VerifyIDToken(ctx, idToken)` → returns UID, email, claims
  - Uses `auth.Client` from Firebase Admin SDK
  - In local mode, connects to Auth emulator automatically (via `FIREBASE_AUTH_EMULATOR_HOST`)
- `internal/middleware/auth.go`:
  - Extracts `Authorization: Bearer <token>` header
  - Calls `auth.VerifyIDToken()`
  - Injects user info into `context` (`context.WithValue`)
  - Returns `401 Unauthorized` for invalid/expired tokens
  - Skip list: login page, static assets, health check endpoint
- Docker Compose `firebase` service:
  - Node 24 image with `firebase-tools` installed
  - Runs `firebase emulators:start --only auth,firestore --import /testdata`
  - Mounts `testdata/firestore/` for seed data
  - Exposes: 4000 (Emulator UI), 8080 (Firestore), 9099 (Auth)
- **Tests**: Token verification (emulator), middleware auth/reject flow, Firestore client connection

---

## Phase 4 — Models & Repository Layer

**Goal**: Go structs for all entities, Firestore CRUD, repository interfaces.

- `internal/model/user.go`:
  - `User` struct (UID, Email, Username, DisplayName, Bio, Location, Website, GithubUrl, TwitterHandle, BlueskyHandle, InstagramHandle, HbarAddress, CreatedAt, UpdatedAt)
  - `Validate()`, `Sanitize()` methods
  - `UserUpdate` struct for partial updates
- `internal/model/project.go`:
  - `Project` struct (ID, UserID, Name, Description, ImageData, ThumbnailData, Width, Height, IsPublic, Tags, CreatedAt, UpdatedAt)
  - Validation, sanitization
- `internal/model/gallery.go`:
  - `GalleryItem` struct
- `internal/model/nft.go`:
  - `NFT` struct — includes Hiero-specific fields (TokenID, SerialNumber, TransactionID)
  - **Note**: Hiero SDK types integrated here after studying `hiero-go-sdk` and Solo docs
- Repository interfaces (for testability):
  ```go
  type UserRepository interface {
      GetByID(ctx context.Context, uid string) (*model.User, error)
      Create(ctx context.Context, user *model.User) error
      Update(ctx context.Context, uid string, update *model.UserUpdate) error
      ClaimUsername(ctx context.Context, uid string, username string) error
  }
  ```
- `internal/repository/user.go` — Firestore implementation of `UserRepository`
  - `ClaimUsername` uses Firestore transaction (atomic check + write on `usernames` collection)
- `internal/repository/project.go` — `ProjectRepository` interface + Firestore impl
  - `List` with pagination (startAfter cursor), `Count` via aggregation
- `internal/repository/gallery.go`, `nft.go` — same pattern
- **Tests**: Repository CRUD against Firebase Emulator, model validation, username claiming race conditions

---

## Phase 5 — Service Layer (Business Logic)

**Goal**: Authorization, validation, business rules — fully testable with mocked repos.

- `internal/service/user.go`:
  - `GetProfile(ctx, uid)` — fetch + sanitize for response
  - `UpdateProfile(ctx, uid, input)` — validate, sanitize, normalize handles (strip `@`), validate URLs
  - `ClaimUsername(ctx, uid, username)` — format validation (`^[a-z0-9_-]{3,30}$`) + uniqueness
- `internal/service/project.go`:
  - `ListProjects(ctx, uid, page)` — paginated, ownership enforced
  - `GetProject(ctx, uid, projectID)` — ownership or isPublic check
  - `CreateProject(ctx, uid, input)` — validate, set timestamps
  - `UpdateProject(ctx, uid, projectID, input)` — ownership check
  - `DeleteProject(ctx, uid, projectID)` — ownership check
  - `CountProjects(ctx, uid)` — true count via Firestore aggregation
- `internal/service/gallery.go` — share to gallery, list, ownership
- `internal/service/nft.go`:
  - **Hiero SDK integration**: mint NFT, list for sale, transfer
  - Uses `hiero-go-sdk` for network interactions
  - Local: connects to Solo network
  - Preview: Hiero testnet
  - Production: Hiero mainnet
  - **Implemented last — after thorough study of Hiero SDK + Solo docs**
- **Tests**: Business logic with testify mocks, edge cases, authorization failures

---

## Phase 6 — API Handlers

**Goal**: RESTful JSON API endpoints wired to services.

- `internal/handler/auth.go`:
  - `POST /api/auth/session` — Exchange Firebase ID token for server session
  - `POST /api/auth/logout` — Destroy session
- `internal/handler/profile.go`:
  - `GET /api/profile` — Get current user's profile
  - `PUT /api/profile` — Update profile
  - `PUT /api/profile/username` — Claim username
  - `POST /api/profile/reset-password` — Trigger password reset email
- `internal/handler/projects.go`:
  - `GET /api/projects` — List (paginated)
  - `GET /api/projects/{id}` — Single project
  - `POST /api/projects` — Create
  - `PUT /api/projects/{id}` — Update
  - `DELETE /api/projects/{id}` — Delete
  - `GET /api/projects/count` — True count
- `internal/handler/gallery.go`:
  - `GET /api/gallery` — List user's gallery items
  - `POST /api/gallery` — Share to gallery
- `internal/handler/nfts.go`:
  - `GET /api/nfts` — List user's NFTs
  - `POST /api/nfts/mint` — Mint NFT (Hiero SDK)
  - `PUT /api/nfts/{id}/list` — List/delist for sale
  - **Implemented last — after Hiero SDK study**
- Response format:
  ```json
  {
    "data": { ... },
    "meta": { "count": 42, "page": 1 },
    "error": null
  }
  ```
- **Tests**: `httptest` handler tests, request validation, error responses, auth enforcement

---

## Phase 7 — Go Templates (SSR Pages)

**Goal**: Server-rendered HTML replaces static HTML files. Preserve existing UI look and feel.

- `web/templates/layouts/base.html` — `<html>`, `<head>`, nav, footer, script/style includes
- `web/templates/partials/nav.html` — Navigation bar (conditional auth state)
- `web/templates/partials/footer.html` — Footer with copyright
- `web/templates/pages/login.html` — Login/signup page (migrated from `public/login.html`)
- `web/templates/pages/profile.html` — Profile sidebar + grids (migrated from `public/profile.html`)
- `web/templates/pages/canvas.html` — Full canvas app (migrated from `public/index.html`)
- `internal/handler/pages.go`:
  - `GET /` → render login (redirect to `/profile` if valid session)
  - `GET /profile` → render profile (redirect to `/` if no session)
  - `GET /canvas` → render canvas (requires session)
  - Custom 404 handler
- Migrate assets:
  - `public/styles/` → `web/static/styles/` (CSS preserved as-is)
  - `public/images/` → `web/static/images/`
- Security headers injected: CSP, CSRF tokens in forms
- **Tests**: Template rendering, redirect logic, CSRF token presence

---

## Phase 8 — TypeScript Migration

**Goal**: All client JS → TypeScript, remove all direct Firestore access from client.

- **Canvas app** (`web/ts/canvas/`):
  - `app.ts` ← `app.js` (PaintBar class, 57KB)
  - `canvasManager.ts` ← `canvasManager.js`
  - `toolManager.ts` ← `toolManager.js`
  - `basicTools.ts` ← `basicTools.js`
  - `objectTools.ts` ← `objectTools.js`
  - `actionTools.ts` ← `actionTools.js`
  - `genericTool.ts` ← `genericTool.js`
  - `save.ts` ← `save.js`
  - **Remove** all Firebase imports from canvas code
  - Add TypeScript interfaces for all tool options, canvas state, drawing events
- **Auth client** (`web/ts/auth/login.ts`):
  - Firebase Auth client SDK (email+password login/signup)
  - On success: get ID token → `POST /api/auth/session` → redirect to `/profile`
  - Error handling with typed error codes
- **Profile client** (`web/ts/profile/profile.ts`):
  - Replace all `onSnapshot`/Firestore calls with `fetch('/api/...')`
  - Keep DOM manipulation (safe rendering, sanitization)
  - Typed API response interfaces
- `web/ts/tsconfig.json`:
  - `strict: true`, `target: "ES2022"`, `lib: ["ES2022", "DOM"]`
  - `moduleResolution: "bundler"`
- esbuild + tsc build pipeline:
  ```bash
  npx esbuild web/ts/canvas/app.ts web/ts/auth/login.ts web/ts/profile/profile.ts \
    --outdir web/static/dist --splitting --minify
  npx tsc --project web/ts/tsconfig.json --noEmit
  ```
- **Tests**: `tsc --noEmit` (type checking), compilation success

---

## Phase 9 — Integration, Cleanup & Security Audit

**Goal**: End-to-end validation, remove legacy code, harden, document, deploy.

- **Integration tests** (Docker Compose + all emulators):
  - Login → session → profile CRUD → project CRUD → gallery share → logout
  - Rate limiting enforcement
  - Session expiry
  - NFT minting (against Solo local network)
- **Remove legacy Node.js files**:
  - `server.js`, `package.json`, `package-lock.json`, `jest.config.js`
  - `node_modules/`, `tests/`
  - `public/scripts/`, `public/styles/`, `public/*.html`
  - `public/` directory entirely (replaced by `web/`)
- **Update `firebase.json`** for Cloud Run rewrites:
  ```json
  {
    "hosting": {
      "public": "web/static",
      "rewrites": [
        {
          "source": "**",
          "run": {
            "serviceId": "paintbar",
            "region": "us-central1"
          }
        }
      ]
    }
  }
  ```
- **Security hardening**:
  - CSP headers (Content-Security-Policy)
  - CSRF protection on all state-changing endpoints
  - Secure session cookies (HttpOnly, Secure, SameSite=Strict)
  - Request body size limits
  - Input sanitization at service layer
  - SQL injection prevention (pgx parameterized queries)
  - Firestore rules as defense-in-depth (secondary to Go API authorization)
- **Deployment setup**:
  - Taskfile: `task deploy-preview` (Cloud Run + Firebase Hosting preview channel)
  - Taskfile: `task deploy-prod` (Cloud Run + Firebase Hosting production)
  - Cloud SQL Postgres setup guide
  - CI/CD pipeline outline (GitHub Actions)
- **Update docs**: README, CONTRIBUTING, `docs/database-schema.md`
- **Final test pass**: `task test` + `task docker-up && task test-integration` + `task ts-check`

---

## Execution Order & Dependencies

```
Phase 0 (Scaffolding) ─────────────────────────────────────────────►
    │
    ▼
Phase 1 (Go Server) ──────────────────────────────────────────────►
    │
    ├──► Phase 2 (Postgres + Goose)       ─────────────────────────►
    │                                       (parallel)
    └──► Phase 3 (Firebase Admin SDK)     ─────────────────────────►
              │
              ▼
         Phase 4 (Models + Repos) ─────────────────────────────────►
              │                        NFT portions deferred until
              ▼                        Hiero SDK + Solo studied
         Phase 5 (Services) ───────────────────────────────────────►
              │
              ▼
         Phase 6 (API Handlers) ───────────────────────────────────►
              │
              ├──► Phase 7 (Go Templates)  ────────────────────────►
              │                                    (parallel)
              └──► Phase 8 (TypeScript)    ────────────────────────►
                        │
                        ▼
                   Phase 9 (Integration + Cleanup + Deploy) ───────►
```

**NFT-specific work** (Hiero SDK integration in Phases 4-6) is deferred within each phase until after thorough study of `github.com/hiero-ledger/hiero-go-sdk` and `solo.hiero.org`. Non-NFT functionality (users, projects, gallery) proceeds independently.
