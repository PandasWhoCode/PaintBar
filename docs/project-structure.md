# Project Structure

[← Architecture](architecture.md) · [Docs Index](README.md) · [API Reference →](api.md)

## Directory Layout

```text
paintbar/
├── api/                          # OpenAPI specification
│   ├── openapi.yaml              # OpenAPI 3.1 spec (source of truth for API)
│   └── embed.go                  # Embeds spec into Go binary via go:embed
│
├── cmd/
│   └── server/
│       └── main.go               # Application entry point, wiring, server startup
│
├── internal/                     # Private Go packages (not importable externally)
│   ├── config/
│   │   ├── config.go             # Environment variable loading + validation
│   │   └── config_test.go        # Config unit tests
│   │
│   ├── handler/                  # HTTP handlers (API + SSR pages)
│   │   ├── handler.go            # Shared helpers: respondJSON, respondError, decodeJSON
│   │   ├── handler_test.go       # Handler unit tests (all endpoints)
│   │   ├── profile.go            # GET/PUT /api/profile, POST /api/claim-username
│   │   ├── project.go            # CRUD /api/projects
│   │   ├── gallery.go            # CRUD /api/gallery
│   │   ├── nft.go                # CRUD /api/nfts
│   │   ├── docs.go               # Swagger UI + OpenAPI spec serving
│   │   ├── pages.go              # SSR page handlers (Login, Profile, Canvas, 404)
│   │   └── render.go             # Go template renderer + PageData struct
│   │
│   ├── middleware/                # HTTP middleware
│   │   ├── auth.go               # Firebase token verification middleware
│   │   ├── auth_test.go          # Auth middleware tests
│   │   ├── cors.go               # CORS configuration
│   │   ├── logging.go            # Structured request logging (slog)
│   │   ├── middleware_test.go     # Middleware integration tests
│   │   ├── ratelimit.go          # In-memory token bucket rate limiter
│   │   ├── recovery.go           # Panic recovery middleware
│   │   └── security.go           # Security headers (CSP, HSTS, X-Frame-Options)
│   │
│   ├── model/                    # Domain models
│   │   ├── user.go               # User, UserUpdate structs + validation
│   │   ├── project.go            # Project, ProjectUpdate structs + validation
│   │   ├── gallery.go            # GalleryItem struct + validation
│   │   ├── nft.go                # NFT struct + validation
│   │   └── model_test.go         # Model validation tests
│   │
│   ├── repository/               # Data access layer
│   │   ├── firestore.go          # Firebase client initialization + health check
│   │   ├── user.go               # UserRepository interface + Firestore impl
│   │   ├── project.go            # ProjectRepository interface + Firestore impl
│   │   ├── gallery.go            # GalleryRepository interface + Firestore impl
│   │   ├── nft.go                # NFTRepository interface + Firestore impl
│   │   └── repository_test.go    # Repository tests (helper unit tests)
│   │
│   └── service/                  # Business logic layer
│       ├── auth.go               # AuthService — Firebase token verification
│       ├── user.go               # UserService — profile CRUD, username claiming
│       ├── project.go            # ProjectService — project CRUD + ownership
│       ├── gallery.go            # GalleryService — gallery sharing + ownership
│       ├── nft.go                # NFTService — NFT record management
│       ├── service_test.go       # Service unit tests
│       └── mock_repos_test.go    # Mock repository implementations for tests
│
├── web/                          # Frontend assets
│   ├── embed.go                  # Embeds templates FS into Go binary
│   ├── templates/
│   │   ├── layouts/
│   │   │   └── base.html         # Base layout (head, body, scripts blocks)
│   │   └── pages/
│   │       ├── login.html        # Login page template
│   │       ├── profile.html      # Profile page template
│   │       ├── canvas.html       # Canvas app template (settings modal + toolbar)
│   │       └── 404.html          # Not found page template
│   │
│   ├── ts/                       # TypeScript source
│   │   ├── tsconfig.json         # TypeScript compiler config (noEmit, strict)
│   │   ├── auth/
│   │   │   └── login.ts          # Login page — Firebase Auth UI
│   │   ├── canvas/
│   │   │   ├── app.ts            # PaintBar main class + DOMContentLoaded init
│   │   │   ├── canvasManager.ts  # Canvas layer management + responsive resize
│   │   │   ├── toolManager.ts    # Tool switching + active tool state
│   │   │   ├── basicTools.ts     # Pencil, eraser, spray, fill, text tools
│   │   │   ├── objectTools.ts    # Rectangle, circle, line, triangle, arc tools
│   │   │   ├── actionTools.ts    # Selection tool (getImageData/putImageData)
│   │   │   ├── genericTool.ts    # GenericTool base class
│   │   │   ├── save.ts           # SaveManager — PNG, JPG, ICO export
│   │   │   └── iro.d.ts          # Type declarations for iro.js color picker
│   │   ├── profile/
│   │   │   └── profile.ts        # Profile page — fetch API, form handling
│   │   └── shared/
│   │       ├── types.ts          # Shared TypeScript interfaces
│   │       ├── firebase-init.ts  # Firebase SDK initialization
│   │       ├── firebase-config.ts          # Firebase config (gitignored, generated)
│   │       ├── firebase-config.template.ts # Template for firebase-config.ts
│   │       └── errors.ts         # Global error handler
│   │
│   └── static/                   # Served at /static/* by Go file server
│       ├── dist/                 # esbuild output (gitignored)
│       ├── images/               # Icons, logos, menu images, favicon
│       └── styles/               # CSS files (styles.css, profile.css, etc.)
│
├── public/                       # Firebase Hosting root (CDN)
│   └── favicon.ico               # Browser favicon (served by CDN)
│
├── testdata/                     # Test fixtures
│   └── firestore/                # Firestore emulator seed data
│
├── build/                        # Legacy build artifacts (pre-migration)
├── design/                       # Design assets
│
├── Dockerfile                    # 3-stage: Go builder → TS builder → Alpine runtime
├── Dockerfile.firebase           # Firebase emulator container (Java 25)
├── docker-compose.yml            # Local dev: firebase, solo
├── Taskfile.yml                  # Task runner commands
├── firebase.json                 # Firebase Hosting config + Firestore rules/indexes
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Firestore composite index definitions
├── .firebaserc                   # Firebase project alias (paintbar-7f887)
├── go.mod / go.sum               # Go module dependencies
├── package.json / package-lock.json # Node dependencies (esbuild, TypeScript)
├── .env.example                  # Environment variable template
└── README.md                     # Project README
```

## Key Conventions

- **`internal/`** — All Go business logic is under `internal/` to prevent external imports
- **`go:embed`** — Templates and the OpenAPI spec are embedded into the binary at compile time
- **Interface-driven repositories** — Each repository defines an interface
  (e.g., `UserRepository`) with a Firestore implementation, enabling mock-based testing
- **Pointer fields for partial updates** — `*string` fields in update structs
  distinguish "not provided" (`nil`) from "set to empty" (`""`)
- **Firestore document IDs** — The `ID` field uses `firestore:"-"` tag (excluded from Firestore data, set from `doc.Ref.ID`)

---

[← Architecture](architecture.md) · [Docs Index](README.md) · [API Reference →](api.md)
