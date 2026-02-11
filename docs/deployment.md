# Deployment

[← Frontend](frontend.md) · [Docs Index](README.md) · [Testing →](testing.md)

## Environments

| Environment    | `ENV`        | Backend               | Database        | Firebase                   | Hiero         |
| -------------- | ------------ | --------------------- | --------------- | -------------------------- | ------------- |
| **Local**      | `local`      | `go run ./cmd/server` | Docker Postgres | Emulator (Docker)          | Solo (Docker) |
| **Preview**    | `preview`    | Cloud Run             | Cloud SQL       | Production Firestore (ADC) | Testnet       |
| **Production** | `production` | Cloud Run             | Cloud SQL       | Production Firestore       | Mainnet       |

---

## Local Development

### Prerequisites

- **Go** 1.25+
- **Node.js** 18+ and npm
- **Docker** and Docker Compose
- **Task** ([taskfile.dev](https://taskfile.dev))

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/pandasWhoCode/paintbar.git
cd paintbar

# 2. Copy environment config
cp .env.example .env

# 3. Install Node dependencies (esbuild, TypeScript)
npm install

# 4. Start Docker dependencies (Postgres + Firebase Emulator)
task docker:up

# 5. Build TypeScript and start the Go server
task run:local
```

The server starts at `http://localhost:8080`.

### Docker Compose Services

```yaml
services:
  postgres: # PostgreSQL 16 — localhost:5432
  firebase: # Firebase Emulator — localhost:4000 (UI), :9099 (Auth), :8081 (Firestore)
  solo: # Hiero Solo — localhost:50211 (gRPC), :5551 (Mirror), :8545 (JSON-RPC)
```

| Service              | Host Port | Purpose                                         |
| -------------------- | --------- | ----------------------------------------------- |
| Postgres             | 5432      | Sessions, rate limits, audit logs               |
| Firebase Emulator UI | 4000      | Visual emulator dashboard                       |
| Firebase Auth        | 9099      | Authentication emulator                         |
| Firestore            | 8081      | Firestore emulator (mapped from container 8080) |
| Hiero Solo gRPC      | 50211     | Local Hiero network                             |
| Hiero Mirror REST    | 5551      | Mirror node API                                 |
| Hiero JSON-RPC       | 8545      | JSON-RPC relay                                  |

### Taskfile Commands

#### Server

| Command              | Description                               |
| -------------------- | ----------------------------------------- |
| `task run`           | Run Go server directly                    |
| `task dev`           | Build TS + run Go server                  |
| `task run:local`     | Start Docker deps + build TS + run server |
| `task stop:local`    | Kill server on :8080 + stop Docker        |
| `task restart:local` | Stop + restart everything                 |
| `task build`         | Build Go binary to `bin/paintbar`         |

#### TypeScript

| Command              | Description                       |
| -------------------- | --------------------------------- |
| `task ts-build`      | Dev build (with source maps)      |
| `task ts-build:prod` | Production build (no source maps) |
| `task ts-check`      | Type checking only (no emit)      |
| `task ts-install`    | Install TS dev dependencies       |

#### Testing

| Command                 | Description                   |
| ----------------------- | ----------------------------- |
| `task test`             | Run all Go tests (`-v -race`) |
| `task test-short`       | Skip integration tests        |
| `task test-integration` | Run against local Postgres    |
| `task bench`            | Run Go benchmarks             |

#### Linting

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `task lint:go`       | Run `go vet`                                 |
| `task lint:ts`       | TypeScript type checking (`tsc --noEmit`)    |
| `task lint:md`       | Lint Markdown files (`markdownlint`)         |
| `task lint:all`      | Run all linters (Go, TypeScript, Markdown)   |
| `task lint-fix:md`   | Auto-fix Markdown (Prettier + markdownlint)  |
| `task lint-fix:ts`   | Auto-fix TypeScript (Prettier)               |
| `task lint-fix:all`  | Auto-fix all (Markdown + TypeScript)         |

#### Database

| Command                       | Description                  |
| ----------------------------- | ---------------------------- |
| `task migrate`                | Run pending Goose migrations |
| `task migrate-down`           | Rollback last migration      |
| `task migrate-status`         | Show migration status        |
| `task migrate-create -- name` | Create new migration file    |

#### Docker

| Command                      | Description                      |
| ---------------------------- | -------------------------------- |
| `task docker:up`             | Start Postgres + Firebase        |
| `task docker:down`           | Stop all services                |
| `task docker:up-all`         | Start all services including app |
| `task docker:down-all`       | Stop all services                |
| `task docker-logs`           | Tail service logs                |
| `task docker:reset-postgres` | Wipe Postgres data + restart     |
| `task docker:reset-firebase` | Wipe Firebase data + restart     |
| `task docker-clean`          | Stop + remove volumes            |

#### Deploy

| Command               | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `task deploy-preview` | Deploy to preview (Cloud Run + Firebase preview channel)              |
| `task deploy-prod`    | Deploy to production (Cloud Run + Firebase Hosting + Firestore rules) |
| `task clean`          | Remove `bin/` and `web/static/dist/`                                  |

---

## Environment Variables

Defined in `.env` (local) or Cloud Run environment (preview/production).

| Variable                        | Default                   | Required        | Description                         |
| ------------------------------- | ------------------------- | --------------- | ----------------------------------- |
| `ENV`                           | `local`                   | ✅              | `local`, `preview`, or `production` |
| `PORT`                          | `8080`                    | ✅              | HTTP server port                    |
| `DATABASE_URL`                  | `postgres://paintbar:...` | ✅              | PostgreSQL connection string        |
| `FIREBASE_PROJECT_ID`           | `paintbar-7f887`          | ✅              | Firebase project ID                 |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | —                         | Production only | Path to service account JSON        |
| `FIRESTORE_EMULATOR_HOST`       | Auto: `localhost:8081`    | Local only      | Firestore emulator address          |
| `FIREBASE_AUTH_EMULATOR_HOST`   | Auto: `localhost:9099`    | Local only      | Auth emulator address               |
| `HIERO_NETWORK`                 | `local`                   |                 | `local`, `testnet`, or `mainnet`    |
| `HIERO_OPERATOR_ID`             | —                         | Production only | Hiero operator account ID           |
| `HIERO_OPERATOR_KEY`            | —                         | Production only | Hiero operator private key          |

---

## Dockerfile

Three-stage multi-stage build:

```text
Stage 1: Go Builder (golang:1.25-alpine)
  ├── Download Go modules
  └── Build binary: CGO_ENABLED=0 go build -o /bin/paintbar ./cmd/server

Stage 2: TS Builder (node:24-alpine)
  ├── npm install (esbuild, TypeScript)
  └── esbuild bundle (3 entry points → web/static/dist/)

Stage 3: Runtime (alpine:latest)
  ├── Copy Go binary from Stage 1
  ├── Copy static assets from source
  ├── Copy esbuild output from Stage 2
  ├── Copy templates from source
  ├── Copy migrations from source
  └── ENTRYPOINT ["/app/paintbar"]
```

---

## Production Deployment

### Cloud Run

The Go server runs on Google Cloud Run in `us-central1`.

```bash
# Deploy (done automatically by `task deploy-prod`)
gcloud run deploy paintbar \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

Cloud Run builds the Docker image using Cloud Build, then deploys a new revision.

**Key settings**:

- Cloud Run auto-sets `PORT` — do not pass it via `--set-env-vars`
- Preview environment uses Application Default Credentials (ADC) — no service account file needed
- Cloud SQL connection via Unix socket: `host=/cloudsql/paintbar-7f887:us-central1:paintbar-db`

### Firebase Hosting

Firebase Hosting acts as a CDN proxy. All requests are rewritten to Cloud Run:

```json
// firebase.json
{
  "hosting": {
    "public": "public",
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

The `public/` directory contains only `favicon.ico` (served from CDN). All other requests proxy to Cloud Run.

### Firestore Rules & Indexes

Deployed alongside hosting:

```bash
firebase deploy --only firestore:rules,hosting
```

Indexes are deployed separately (or via `gcloud`) to avoid 409 conflicts when indexes already exist:

```bash
gcloud firestore indexes composite create \
  --project=paintbar-7f887 \
  --collection-group=gallery \
  --field-config=field-path=userId,order=ascending \
  --field-config=field-path=createdAt,order=descending
```

### Full Production Deploy

```bash
task deploy-prod
```

This runs:

1. `task ts-build:prod` — Build TypeScript (no source maps)
2. `gcloud run deploy paintbar --source . --region us-central1 --allow-unauthenticated`
3. `firebase deploy --only firestore:rules,hosting`

---

## Preview Deployment

```bash
task deploy-preview
```

This runs:

1. `task ts-build:prod`
2. `gcloud run deploy paintbar --source . --region us-central1 --allow-unauthenticated`
3. `firebase hosting:channel:deploy preview-<branch-name>`

Preview channels create temporary URLs like `https://paintbar-7f887--preview-feature-xyz-abc123.web.app`.

---

## Graceful Shutdown

The Go server handles `SIGINT` and `SIGTERM` for graceful shutdown:

1. Stop accepting new connections
2. Wait up to 30 seconds for in-flight requests to complete
3. Close database connections (Postgres pool + Firestore client)
4. Exit cleanly

This is critical for Cloud Run, which sends `SIGTERM` before terminating instances.

---

## Server Configuration

```go
srv := &http.Server{
    Addr:              ":" + cfg.Port,
    ReadTimeout:       15 * time.Second,
    ReadHeaderTimeout: 5 * time.Second,
    WriteTimeout:      15 * time.Second,
    IdleTimeout:       60 * time.Second,
    MaxHeaderBytes:    1 << 20, // 1 MB
}
```

---

[← Frontend](frontend.md) · [Docs Index](README.md) · [Testing →](testing.md)
