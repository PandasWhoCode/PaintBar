# Architecture

[← Back to Docs](README.md)

## System Overview

PaintBar is a web-based pixel art platform with a Go backend, TypeScript frontend, Firebase authentication, dual-database persistence (Firestore + PostgreSQL), and NFT minting via the Hiero network.

## High-Level Architecture

```
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
│                          └────┬──────────┬───┘                  │
└───────────────────────────────┼──────────┼──────────────────────┘
                                │          │
                    ┌───────────┘          └───────────┐
                    ▼                                  ▼
          ┌──────────────────┐              ┌──────────────────┐
          │  Cloud Firestore │              │  Cloud SQL       │
          │  (Primary DB)    │              │  PostgreSQL 16   │
          │                  │              │                  │
          │  • users         │              │  • sessions      │
          │  • usernames     │              │  • rate_limits   │
          │  • projects      │              │  • audit_logs    │
          │  • gallery       │              │                  │
          │  • nfts          │              │                  │
          └──────────────────┘              └──────────────────┘
```

## Go Backend Layers

The backend follows a clean **Handler → Service → Repository** architecture:

```
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
│ repository/  │     │   model/     │
│ (Firestore   │────▶│  (structs,   │
│  + Postgres  │     │   validation,│
│  persistence)│     │   sanitize)  │
│  user.go     │     │  user.go     │
│  project.go  │     │  project.go  │
│  gallery.go  │     │  gallery.go  │
│  nft.go      │     │  nft.go      │
│  session.go  │     └──────────────┘
│  postgres.go │
│  firestore.go│
│  migrate.go  │
└──────────────┘
```

### Layer Responsibilities

| Layer | Package | Responsibility |
|---|---|---|
| **Config** | `internal/config` | Load + validate environment variables |
| **Middleware** | `internal/middleware` | Auth, rate limiting, security headers, CORS, logging, recovery |
| **Handler** | `internal/handler` | HTTP request/response, JSON encoding, pagination, SSR rendering |
| **Service** | `internal/service` | Business logic, input validation, authorization checks |
| **Repository** | `internal/repository` | Firestore/Postgres CRUD, connection pooling, migrations |
| **Model** | `internal/model` | Domain structs, field validation, sanitization, update maps |

## Middleware Stack

Middleware is applied in order (top-to-bottom = outermost-to-innermost):

```
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

```
Browser → Firebase Hosting → Cloud Run → chi Router
  → SecurityHeaders → RateLimiter → PageHandler.Canvas()
  → TemplateRenderer.Render("canvas", data)
  → HTML response (Go template + embedded TS bundle)
```

### API Request (JSON)

```
Browser (fetch + Bearer token) → Firebase Hosting → Cloud Run → chi Router
  → SecurityHeaders → RateLimiter → CORS → Auth middleware
  → Extract UID from token → Handler → Service → Repository → Firestore
  → JSON response
```

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Router** | go-chi/chi | Lightweight, stdlib-compatible, middleware chaining |
| **Logging** | log/slog (stdlib) | Structured JSON logging, zero dependencies |
| **Postgres driver** | jackc/pgx/v5 | High-performance, pure Go, connection pooling |
| **Migrations** | pressly/goose | SQL-based, embedded FS support, simple CLI |
| **TS bundler** | esbuild | Sub-100ms builds, code splitting, tree shaking |
| **Task runner** | Taskfile | YAML-based, cross-platform, dependency graph |
| **Auth** | Firebase Auth | Free tier, Google/email providers, Admin SDK for server verification |
| **Primary DB** | Firestore | Real-time listeners, offline support, auto-scaling |
| **Relational DB** | PostgreSQL | ACID transactions for sessions, rate limits, audit logs |

## Deployment Topology

### Local Development

```
┌─────────────────────────────────────────────┐
│              Docker Compose                  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Postgres │  │ Firebase │  │  Hiero    │  │
│  │ :5432    │  │ Emulator │  │  Solo     │  │
│  │          │  │ :4000 UI │  │  :50211   │  │
│  │          │  │ :9099 Auth│  │           │  │
│  │          │  │ :8081 FS │  │           │  │
│  └──────────┘  └──────────┘  └───────────┘  │
└─────────────────────────────────────────────┘
        │              │
        └──────┬───────┘
               ▼
     ┌──────────────────┐
     │  Go Server       │
     │  (go run)        │
     │  localhost:8080   │
     └──────────────────┘
```

### Production

```
┌──────────────────┐     ┌──────────────────┐
│ Firebase Hosting │────▶│   Cloud Run      │
│ (CDN + proxy)    │     │   (Go binary)    │
│ paintbar.web.app │     │                  │
└──────────────────┘     └────┬────────┬────┘
                              │        │
                    ┌─────────┘        └─────────┐
                    ▼                            ▼
          ┌──────────────────┐        ┌──────────────────┐
          │ Cloud Firestore  │        │ Cloud SQL        │
          │ (production)     │        │ PostgreSQL 16    │
          └──────────────────┘        └──────────────────┘
```

## Environment Configuration

The server supports three environments controlled by the `ENV` variable:

| Environment | `ENV` value | Emulators | Migrations | Swagger UI | HSTS |
|---|---|---|---|---|---|
| **Local** | `local` | Auto-configured | Auto-run | Enabled | Off |
| **Preview** | `preview` | Off (uses ADC) | Auto-run | Enabled | Off |
| **Production** | `production` | Off | Manual | Disabled | On |

See [Deployment](deployment.md) for full environment variable reference.
