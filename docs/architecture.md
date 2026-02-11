# Architecture

[← Docs Index](README.md) · [Project Structure →](project-structure.md)

## System Overview

PaintBar is a web-based pixel art platform with a Go backend, TypeScript
frontend, Firebase authentication, Firestore persistence,
and NFT minting via the Hiero network.

## High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Firebase Hosting                         │
│                    (CDN proxy → Cloud Run)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ rewrites **
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud Run (Go Server)                        │
│                                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ chi      │  │ Middleware │  │ Handlers │  │ SSR Templates │  │
│  │ Router   │→ │ Stack     │→ │ (API)    │  │ (Pages)       │  │
│  └──────────┘  └───────────┘  └────┬─────┘  └───────────────┘  │
│                                    │                             │
│                          ┌─────────┴─────────┐                  │
│                          │    Service Layer   │                  │
│                          └─────────┬─────────┘                  │
│                          ┌─────────┴─────────┐                  │
│                          │  Repository Layer  │                  │
│                          └─────────┬─────────┘                  │
└────────────────────────────────────┼────────────────────────────┘
                                     │
                                     ▼
                           ┌──────────────────┐
                           │  Cloud Firestore │
                           │                  │
                           │  • users         │
                           │  • usernames     │
                           │  • projects      │
                           │  • gallery       │
                           │  • nfts          │
                           └──────────────────┘
```

## Go Backend Layers

The backend follows a clean **Handler → Service → Repository** architecture:

```text
┌─────────────────────────────────────────────────────┐
│                    cmd/server/main.go                │
│            (wiring, config, server startup)          │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌───────────┐  ┌─────────────────┐
│   handler/   │ │ middleware/│  │   handler/       │
│  (API JSON)  │ │ (auth,    │  │   pages.go       │
│  profile.go  │ │  rate     │  │   render.go      │
│  project.go  │ │  limit,   │  │  (SSR templates) │
│  gallery.go  │ │  security,│  └─────────────────┘
│  nft.go      │ │  CORS,    │
│  docs.go     │ │  logging) │
└──────┬───────┘ └───────────┘
       │
       ▼
┌──────────────┐
│   service/   │
│  (business   │
│   logic,     │
│   validation)│
│  auth.go     │
│  user.go     │
│  project.go  │
│  gallery.go  │
│  nft.go      │
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│ (Firestore   │     │   model/     │
│  persistence)│     │  (structs,   │
│  user.go     │     │   validation,│
│  project.go  │     │   sanitize)  │
│  gallery.go  │     │  user.go     │
│  nft.go      │     │  project.go  │
│  firestore.go│     │  gallery.go  │
└──────────────┘     │  nft.go      │
                     └──────────────┘
```

### Layer Responsibilities

| Layer          | Package               | Responsibility                                                  |
| -------------- | --------------------- | --------------------------------------------------------------- |
| **Config**     | `internal/config`     | Load + validate environment variables                           |
| **Middleware** | `internal/middleware` | Auth, rate limiting, security headers, CORS, logging, recovery  |
| **Handler**    | `internal/handler`    | HTTP request/response, JSON encoding, pagination, SSR rendering |
| **Service**    | `internal/service`    | Business logic, input validation, authorization checks          |
| **Repository** | `internal/repository` | Firestore CRUD, Firebase client initialization                  |
| **Model**      | `internal/model`      | Domain structs, field validation, sanitization, update maps     |

## Middleware Stack

Middleware is applied in order (top-to-bottom = outermost-to-innermost):

```text
Request
  │
  ▼
┌──────────────────────┐
│  1. RequestID        │  chi: assigns unique request ID
├──────────────────────┤
│  2. RealIP           │  chi: extracts real client IP
├──────────────────────┤
│  3. Recovery         │  custom: panic recovery, logs stack trace
├──────────────────────┤
│  4. SecurityHeaders  │  custom: CSP, X-Frame-Options, HSTS, etc.
├──────────────────────┤
│  5. RequestLogger    │  custom: structured slog request logging
├──────────────────────┤
│  6. RateLimiter      │  custom: 100 req/min per IP (skips /static, /health)
├──────────────────────┤
│  7. CORS             │  custom: API routes only
├──────────────────────┤
│  8. Auth             │  custom: Firebase token verification (API routes only)
└──────────────────────┘
  │
  ▼
Handler
```

## Request Flow

### Page Request (SSR)

```text
Browser → Firebase Hosting → Cloud Run → chi Router
  → SecurityHeaders → RateLimiter → PageHandler.Canvas()
  → TemplateRenderer.Render("canvas", data)
  → HTML response (Go template + embedded TS bundle)
```

### API Request (JSON)

```text
Browser (fetch + Bearer token) → Firebase Hosting → Cloud Run → chi Router
  → SecurityHeaders → RateLimiter → CORS → Auth middleware
  → Extract UID from token → Handler → Service → Repository → Firestore
  → JSON response
```

## Technology Decisions

| Decision            | Choice            | Rationale                                                            |
| ------------------- | ----------------- | -------------------------------------------------------------------- |
| **Router**          | go-chi/chi        | Lightweight, stdlib-compatible, middleware chaining                  |
| **Logging**         | log/slog (stdlib) | Structured JSON logging, zero dependencies                           |
| **TS bundler**      | esbuild           | Sub-100ms builds, code splitting, tree shaking                       |
| **Task runner**     | Taskfile          | YAML-based, cross-platform, dependency graph                         |
| **Auth**            | Firebase Auth     | Free tier, Google/email providers, Admin SDK for server verification |
| **Database**        | Firestore         | Real-time listeners, offline support, auto-scaling                   |

## Deployment Topology

### Local Development

```text
┌─────────────────────────────────────────────┐
│              Docker Compose                  │
│                                              │
│  ┌──────────┐  ┌───────────┐               │
│  │ Firebase │  │  Hiero    │               │
│  │ Emulator │  │  Solo     │               │
│  │ :4000 UI │  │  :50211   │               │
│  │ :9099 Auth│  │           │               │
│  │ :8081 FS │  │           │               │
│  └──────────┘  └───────────┘               │
└─────────────────────────────────────────────┘
               │
               ▼
     ┌──────────────────┐
     │  Go Server       │
     │  (go run)        │
     │  localhost:8080   │
     └──────────────────┘
```

### Production

```text
┌──────────────────┐     ┌──────────────────┐
│ Firebase Hosting │────▶│   Cloud Run      │
│ (CDN + proxy)    │     │   (Go binary)    │
│ paintbar.web.app │     │                  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ Cloud Firestore  │
                        │ (production)     │
                        └──────────────────┘
```

## Environment Configuration

The server supports three environments controlled by the `ENV` variable:

| Environment    | `ENV` value  | Emulators       | Swagger UI | HSTS |
| -------------- | ------------ | --------------- | ---------- | ---- |
| **Local**      | `local`      | Auto-configured | Enabled    | Off  |
| **Preview**    | `preview`    | Off (uses ADC)  | Enabled    | Off  |
| **Production** | `production` | Off             | Disabled   | On   |

See [Deployment](deployment.md) for full environment variable reference.

---

[← Docs Index](README.md) · [Project Structure →](project-structure.md)
