# PaintBar Developer Documentation

Welcome to the PaintBar developer docs. This documentation covers the full architecture, API, database schema, frontend, authentication, deployment, testing, and project structure.

## Table of Contents

| Document | Description |
|---|---|
| [Architecture](architecture.md) | System architecture, tech stack, layer diagram, deployment topology |
| [Project Structure](project-structure.md) | Directory layout, file descriptions, Go package organization |
| [API Reference](api.md) | REST API endpoints, request/response schemas, authentication |
| [Database](database.md) | Firestore collections, PostgreSQL schema, ER diagrams, security rules |
| [Authentication](authentication.md) | Firebase Auth flow, middleware chain, token verification |
| [Frontend](frontend.md) | TypeScript canvas app, Go templates, esbuild pipeline, canvas layers |
| [Deployment](deployment.md) | Local dev, Docker Compose, Cloud Run, Firebase Hosting, CI/CD |
| [Testing](testing.md) | Test strategy, running tests, coverage, benchmarks |
| [Database Schema (Legacy)](database-schema.md) | Original Firestore schema reference (pre-migration) |
| [Menu Reference](menus.md) | Canvas toolbar menus, tools, shapes, and keyboard shortcuts |

## Quick Links

- **OpenAPI Spec**: [`api/openapi.yaml`](../api/openapi.yaml)
- **Swagger UI** (local/preview only): `http://localhost:8080/api/docs`
- **Firestore Rules**: [`firestore.rules`](../firestore.rules)
- **Firestore Indexes**: [`firestore.indexes.json`](../firestore.indexes.json)
- **Docker Compose**: [`docker-compose.yml`](../docker-compose.yml)
- **Taskfile**: [`Taskfile.yml`](../Taskfile.yml)

## Tech Stack at a Glance

| Layer | Technology |
|---|---|
| **Backend** | Go 1.25, chi router, slog logging |
| **Frontend** | TypeScript, esbuild, HTML5 Canvas |
| **SSR** | Go `html/template` |
| **Auth** | Firebase Authentication (client SDK + Admin SDK) |
| **Primary DB** | Cloud Firestore (users, projects, gallery, NFTs) |
| **Relational DB** | PostgreSQL 16 via pgx (sessions, rate limits, audit logs) |
| **Migrations** | Goose |
| **NFT Network** | Hiero (Hedera) — Hiero Go SDK |
| **Task Runner** | [Taskfile](https://taskfile.dev) |
| **Infrastructure** | Docker Compose (local), Cloud Run + Firebase Hosting (production) |
