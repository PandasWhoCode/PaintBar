# Database

[← API Reference](api.md) · [Docs Index](README.md) · [Authentication →](authentication.md)

PaintBar uses a dual-database architecture:

- **Cloud Firestore** — Primary database for user-facing data (profiles, projects, gallery, NFTs)
- **PostgreSQL 16** — Relational database for server-side concerns (sessions, rate limits, audit logs)

## Entity Relationship Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLOUD FIRESTORE                                │
│                                                                         │
│  ┌──────────────┐    1:1     ┌──────────────┐                          │
│  │   users      │◄──────────▶│  usernames   │                          │
│  │              │            │              │                          │
│  │  uid (PK)    │            │  username(PK)│                          │
│  │  email       │            │  uid         │                          │
│  │  username    │            │  createdAt   │                          │
│  │  displayName │            └──────────────┘                          │
│  │  bio         │                                                      │
│  │  location    │    1:N     ┌──────────────┐                          │
│  │  website     │◄──────────▶│  projects    │                          │
│  │  githubUrl   │            │              │                          │
│  │  twitterHdl  │            │  id (auto)   │                          │
│  │  blueskyHdl  │            │  userId      │──┐                      │
│  │  instagramHdl│            │  name        │  │                      │
│  │  hbarAddress │            │  description │  │  1:N                  │
│  │  createdAt   │            │  imageData   │  │  (via projectId)     │
│  │  updatedAt   │            │  thumbnailDt │  │  ┌──────────────┐    │
│  └──────────────┘            │  width       │  └─▶│  gallery     │    │
│         │                    │  height      │     │              │    │
│         │                    │  isPublic    │     │  id (auto)   │    │
│         │                    │  tags[]      │     │  userId      │    │
│         │                    │  createdAt   │     │  projectId   │    │
│         │                    │  updatedAt   │     │  name        │    │
│         │                    └──────────────┘     │  description │    │
│         │                                         │  imageData   │    │
│         │    1:N     ┌──────────────┐             │  thumbnailDt │    │
│         └───────────▶│    nfts      │             │  width       │    │
│                      │              │             │  height      │    │
│                      │  id (auto)   │             │  tags[]      │    │
│                      │  userId      │             │  createdAt   │    │
│                      │  name        │             └──────────────┘    │
│                      │  description │                                  │
│                      │  imageData   │                                  │
│                      │  imageUrl    │                                  │
│                      │  thumbnailDt │                                  │
│                      │  metadata    │                                  │
│                      │  price       │                                  │
│                      │  isListed    │                                  │
│                      │  tokenId     │  ← Hiero network                │
│                      │  serialNum   │                                  │
│                      │  txnId       │                                  │
│                      │  createdAt   │                                  │
│                      │  updatedAt   │                                  │
│                      └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           POSTGRESQL 16                                 │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │    sessions       │  │   rate_limits    │  │    audit_logs        │  │
│  │                   │  │                  │  │                      │  │
│  │  id (UUID PK)     │  │  id (BIGSERIAL)  │  │  id (BIGSERIAL PK)  │  │
│  │  user_id (TEXT)   │  │  key (TEXT)      │  │  user_id (TEXT)      │  │
│  │  token_hash (UNQ) │  │  window_start   │  │  action (TEXT)       │  │
│  │  ip_address (INET)│  │  request_count  │  │  resource_type (TEXT)│  │
│  │  user_agent (TEXT)│  │                  │  │  resource_id (TEXT)  │  │
│  │  expires_at (TSZ) │  │  UNQ(key,       │  │  details (JSONB)     │  │
│  │  created_at (TSZ) │  │    window_start)│  │  ip_address (INET)   │  │
│  └──────────────────┘  └──────────────────┘  │  created_at (TSZ)    │  │
│                                               └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Firestore Collections

### `users`

Keyed by Firebase Auth UID. One document per user.

| Field             | Type      | Required | Description                              |
| ----------------- | --------- | -------- | ---------------------------------------- |
| `uid`             | string    | ✅       | Firebase Auth UID (also the document ID) |
| `email`           | string    | ✅       | User's email address                     |
| `username`        | string    |          | Unique username (immutable once set)     |
| `displayName`     | string    |          | Display name (max 100 chars)             |
| `bio`             | string    |          | User bio (max 500 chars)                 |
| `location`        | string    |          | Location (max 100 chars)                 |
| `website`         | string    |          | Website URL (http/https)                 |
| `githubUrl`       | string    |          | GitHub profile URL                       |
| `twitterHandle`   | string    |          | Twitter/X handle (without @)             |
| `blueskyHandle`   | string    |          | Bluesky handle (without @)               |
| `instagramHandle` | string    |          | Instagram handle (without @)             |
| `hbarAddress`     | string    |          | HBAR wallet address                      |
| `createdAt`       | timestamp | ✅       | Creation timestamp                       |
| `updatedAt`       | timestamp | ✅       | Last update timestamp                    |

### `usernames`

Lookup collection for username uniqueness enforcement. Keyed by the username string.

| Field       | Type      | Required | Description                   |
| ----------- | --------- | -------- | ----------------------------- |
| `uid`       | string    | ✅       | Owner's Firebase Auth UID     |
| `createdAt` | timestamp | ✅       | When the username was claimed |

**Username claiming** uses a Firestore transaction to atomically:

1. Check if the username document exists in `usernames`
2. Create the `usernames/{username}` document
3. Set the `username` field on `users/{uid}`

### `projects`

Canvas projects. Auto-generated document IDs.

| Field           | Type            | Required | Description                              |
| --------------- | --------------- | -------- | ---------------------------------------- |
| `userId`        | string          | ✅       | Owner's Firebase Auth UID                |
| `name`          | string          | ✅       | Project name (max 200 chars)             |
| `description`   | string          |          | Description (max 2000 chars)             |
| `imageData`     | string          |          | Base64-encoded canvas image              |
| `thumbnailData` | string          |          | Base64-encoded thumbnail                 |
| `width`         | integer         |          | Canvas width in pixels                   |
| `height`        | integer         |          | Canvas height in pixels                  |
| `isPublic`      | boolean         |          | Public visibility flag (default `false`) |
| `tags`          | array\<string\> |          | Tags (max 20, each max 50 chars)         |
| `createdAt`     | timestamp       | ✅       | Creation timestamp                       |
| `updatedAt`     | timestamp       | ✅       | Last update timestamp                    |

**Composite index**: `userId ASC, createdAt DESC` (for user's project listing)

### `gallery`

Public gallery items. Sharing to gallery is an explicit user action that opts the item into public visibility.

| Field           | Type            | Required | Description                  |
| --------------- | --------------- | -------- | ---------------------------- |
| `userId`        | string          | ✅       | Owner's Firebase Auth UID    |
| `projectId`     | string          |          | Source project ID            |
| `name`          | string          | ✅       | Item name (max 200 chars)    |
| `description`   | string          |          | Description (max 2000 chars) |
| `imageData`     | string          |          | Base64-encoded image         |
| `thumbnailData` | string          |          | Base64-encoded thumbnail     |
| `width`         | integer         |          | Image width                  |
| `height`        | integer         |          | Image height                 |
| `tags`          | array\<string\> |          | Tags                         |
| `createdAt`     | timestamp       | ✅       | Creation timestamp           |

**Composite index**: `userId ASC, createdAt DESC`

### `nfts`

NFT records with Hiero (Hedera) network metadata.

| Field           | Type      | Required | Description               |
| --------------- | --------- | -------- | ------------------------- |
| `userId`        | string    | ✅       | Owner's Firebase Auth UID |
| `name`          | string    | ✅       | NFT name (max 200 chars)  |
| `description`   | string    |          | Description               |
| `imageData`     | string    |          | Base64-encoded image      |
| `imageUrl`      | string    |          | External image URL        |
| `thumbnailData` | string    |          | Base64-encoded thumbnail  |
| `metadata`      | string    |          | NFT metadata JSON         |
| `price`         | number    |          | Price in HBAR (≥ 0)       |
| `isListed`      | boolean   |          | Whether listed for sale   |
| `tokenId`       | string    |          | Hiero network token ID    |
| `serialNumber`  | integer   |          | Hiero NFT serial number   |
| `transactionId` | string    |          | Hiero transaction ID      |
| `createdAt`     | timestamp | ✅       | Creation timestamp        |
| `updatedAt`     | timestamp | ✅       | Last update timestamp     |

**Composite index**: `userId ASC, createdAt DESC`

---

## Firestore Security Rules

Rules are defined in [`firestore.rules`](../firestore.rules) and deployed via `firebase deploy --only firestore:rules`.

```text
Collection     Read                                    Write                              Create
─────────────  ──────────────────────────────────────  ─────────────────────────────────  ──────────────────────────
usernames      Any authenticated user                  ✗ (updates forbidden)              Owner only (uid match)
users          Owner only                              Owner only                         Owner only
projects       Owner OR isPublic == true               Owner only                         Owner only (userId match)
gallery        Any authenticated user (public by       Owner only                         Owner only (userId match)
               design — sharing = opting in)
nfts           Owner OR isListed == true               Owner only                         Owner only (userId match)
```

> **Note**: The Go backend uses the Firebase Admin SDK, which **bypasses**
> Firestore security rules. Rules protect direct client-side access only.

---

## Firestore Indexes

Defined in [`firestore.indexes.json`](../firestore.indexes.json):

| Collection | Fields                         | Purpose                                    |
| ---------- | ------------------------------ | ------------------------------------------ |
| `projects` | `userId` ASC, `createdAt` DESC | List user's projects sorted by newest      |
| `gallery`  | `userId` ASC, `createdAt` DESC | List user's gallery items sorted by newest |
| `nfts`     | `userId` ASC, `createdAt` DESC | List user's NFTs sorted by newest          |

Deploy: `firebase deploy --only firestore:indexes`

---

## PostgreSQL Schema

Managed by [Goose](https://github.com/pressly/goose) migrations in `migrations/`.

### `sessions`

Server-side session storage (Phase 7 — future use).

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Indexes: idx_sessions_user_id, idx_sessions_expires_at
```

### `rate_limits`

Postgres-backed rate limiting (Phase 2 — future replacement for in-memory limiter).

```sql
CREATE TABLE rate_limits (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    UNIQUE(key, window_start)
);
-- Index: idx_rate_limits_key_window
```

### `audit_logs`

Audit trail for security-sensitive operations.

```sql
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
-- Indexes: idx_audit_logs_user_id, idx_audit_logs_created_at
```

### Running Migrations

```bash
# Auto-run in local/preview environments on server startup

# Manual commands via Taskfile:
task migrate              # Run all pending migrations
task migrate-down         # Rollback last migration
task migrate-status       # Show migration status
task migrate-create -- add_new_table  # Create new migration file
```

---

[← API Reference](api.md) · [Docs Index](README.md) · [Authentication →](authentication.md)
