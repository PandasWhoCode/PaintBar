# PaintBar Developer Documentation

Welcome to the PaintBar developer docs. This documentation covers the full
architecture, API, database schema, frontend, authentication, deployment,
testing, and project structure.

## Table of Contents

| #   | Document                                       | Description                                                           |
| --- | ---------------------------------------------- | --------------------------------------------------------------------- |
| 1   | [Architecture](architecture.md)                | System architecture, tech stack, layer diagram, deployment topology   |
| 2   | [Project Structure](project-structure.md)      | Directory layout, file descriptions, Go package organization          |
| 3   | [API Reference](api.md)                        | REST API endpoints, request/response schemas, authentication          |
| 4   | [Database](database.md)                        | Firestore collections, ER diagrams, security rules                    |
| 5   | [Authentication](authentication.md)            | Firebase Auth flow, middleware chain, token verification              |
| 6   | [Frontend](frontend.md)                        | TypeScript canvas app, Go templates, esbuild pipeline, canvas layers  |
| 7   | [Deployment](deployment.md)                    | Local dev, Docker Compose, Cloud Run, Firebase Hosting, CI/CD         |
| 8   | [Testing](testing.md)                          | Test strategy, running tests, coverage, benchmarks                    |
| 9   | [Menu Reference](menus.md)                     | Canvas toolbar menus, tools, shapes, and keyboard shortcuts           |
| —   | [Database Schema (Legacy)](database-schema.md) | Original Firestore schema reference (pre-migration)                   |

> **Start reading**: [Architecture →](architecture.md)

## Quick Links

- **OpenAPI Spec**: [`api/openapi.yaml`](../api/openapi.yaml)
- **Swagger UI** (local/preview only): `http://localhost:8080/api/docs`
- **Firestore Rules**: [`firestore.rules`](../firestore.rules)
- **Firestore Indexes**: [`firestore.indexes.json`](../firestore.indexes.json)
- **Docker Compose**: [`docker-compose.yml`](../docker-compose.yml)
- **Taskfile**: [`Taskfile.yml`](../Taskfile.yml)

## Tech Stack at a Glance

| Layer              | Technology                                                        |
| ------------------ | ----------------------------------------------------------------- |
| **Backend**        | Go 1.25, chi router, slog logging                                 |
| **Frontend**       | TypeScript, esbuild, HTML5 Canvas                                 |
| **SSR**            | Go `html/template`                                                |
| **Auth**           | Firebase Authentication (client SDK + Admin SDK)                  |
| **Database**       | Cloud Firestore (users, projects, gallery, NFTs)                  |
| **NFT Network**    | Hiero (Hedera) — Hiero Go SDK                                     |
| **Task Runner**    | [Taskfile](https://taskfile.dev)                                  |
| **Infrastructure** | Docker Compose (local), Cloud Run + Firebase Hosting (production) |
