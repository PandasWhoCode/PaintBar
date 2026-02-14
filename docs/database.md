# Database

[← API Reference](api.md) · [Docs Index](README.md) · [Authentication →](authentication.md)

PaintBar uses **Cloud Firestore** as its sole database for all
persistent data (profiles, projects, gallery, NFTs). Rate limiting
is handled in-memory by the Go middleware.

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
│  │  instagramHdl│            │  userId      │──┐                      │
│  │  hbarAddress │            │  title       │  │                      │
│  │  createdAt   │            │  contentHash │  │  1:N                  │
│  │  updatedAt   │            │  storageURL  │  │  (via projectId)     │
│  └──────────────┘            │  thumbnailDt │  │  ┌──────────────┐    │
│         │                    │  width       │  └─▶│  gallery     │    │
│         │                    │  height      │     │              │    │
│         │                    │  isPublic    │     │  id (auto)   │    │
│         │                    │  tags[]      │     │  userId      │    │
│         │                    │  createdAt   │     │  projectId   │    │
│         │                    └──────────────┘     │  name        │    │
│         │                                         │  description │    │
│         │    1:N     ┌──────────────┐             │  imageData   │    │
│         └───────────▶│    nfts      │             │  thumbnailDt │    │
│                      │              │             │  width       │    │
│                      │  id (auto)   │             │  height      │    │
│                      │  userId      │             │  tags[]      │    │
│                      │  name        │             │  createdAt   │    │
│                      │  description │             └──────────────┘    │
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

| Field           | Type            | Required | Description                                    |
| --------------- | --------------- | -------- | ---------------------------------------------- |
| `userId`        | string          | ✅       | Owner's Firebase Auth UID                      |
| `title`         | string          | ✅       | Project title (max 200 chars)                  |
| `contentHash`   | string          | ✅       | SHA-256 hex of canvas PNG (64 chars)           |
| `storageURL`    | string          |          | Firebase Storage download URL                  |
| `thumbnailData` | string          |          | Base64 data:image/ URI (500 KB, 200px max)     |
| `width`         | integer         |          | Canvas width in pixels                         |
| `height`        | integer         |          | Canvas height in pixels                        |
| `isPublic`      | boolean         |          | Public visibility flag (default `false`)       |
| `tags`          | array\<string\> |          | Tags (max 20, each max 50 chars)               |
| `createdAt`     | timestamp       | ✅       | Creation timestamp                             |
| `updatedAt`     | timestamp       | ✅       | Last update timestamp                          |

**Composite index**: `userId ASC, createdAt DESC` (for user's project listing)

### `gallery`

Public gallery items. Sharing to gallery is an explicit user action that opts the item into public visibility.

| Field           | Type            | Required | Description                                   |
| --------------- | --------------- | -------- | --------------------------------------------- |
| `userId`        | string          | ✅       | Owner's Firebase Auth UID                     |
| `projectId`     | string          |          | Source project ID                             |
| `name`          | string          | ✅       | Item name (max 200 chars)                     |
| `description`   | string          |          | Description (max 2000 chars)                  |
| `imageData`     | string          |          | Base64 `data:image/` URI (max 500 KB)         |
| `thumbnailData` | string          |          | Base64 `data:image/` URI thumb (max 500 KB)   |
| `width`         | integer         |          | Image width                                   |
| `height`        | integer         |          | Image height                                  |
| `tags`          | array\<string\> |          | Tags                                          |
| `createdAt`     | timestamp       | ✅       | Creation timestamp                            |

> **Validation**: `imageData` and `thumbnailData` must start with `data:image/`
> to prevent arbitrary content injection.

**Composite index**: `userId ASC, createdAt DESC`

### `nfts`

NFT records with Hiero (Hedera) network metadata.

| Field           | Type      | Required | Description                                   |
| --------------- | --------- | -------- | --------------------------------------------- |
| `userId`        | string    | ✅       | Owner's Firebase Auth UID                     |
| `name`          | string    | ✅       | NFT name (max 200 chars)                      |
| `description`   | string    |          | Description                                   |
| `imageData`     | string    |          | Base64 `data:image/` URI (max 500 KB)         |
| `imageUrl`      | string    |          | External image URL (http/https only)          |
| `thumbnailData` | string    |          | Base64 `data:image/` URI thumb (max 500 KB)   |
| `metadata`      | string    |          | NFT metadata JSON                             |
| `price`         | number    |          | Price in HBAR (≥ 0)                           |
| `isListed`      | boolean   |          | Whether listed for sale                       |
| `tokenId`       | string    |          | Hiero network token ID                        |
| `serialNumber`  | integer   |          | Hiero NFT serial number                       |
| `transactionId` | string    |          | Hiero transaction ID                          |
| `createdAt`     | timestamp | ✅       | Creation timestamp                            |
| `updatedAt`     | timestamp | ✅       | Last update timestamp                         |

**Composite index**: `userId ASC, createdAt DESC`

> **Validation**: `imageData` and `thumbnailData` must start with `data:image/`.
> Blockchain fields (`tokenId`, `serialNumber`, `transactionId`) are server-managed
> and zeroed on creation to prevent clients from submitting fake metadata.

---

## Firestore Security Rules

Rules are defined in [`firestore.rules`](../firestore.rules) and deployed via `firebase deploy --only firestore:rules`.

```text
Collection     Read                                    Create                             Update                                Delete
─────────────  ──────────────────────────────────────  ─────────────────────────────────  ────────────────────────────────────  ──────────────
usernames      Any authenticated user                  Owner only (uid match)              ✗ (forbidden)                         Owner only
users          Owner only                              Owner only                         Owner only                            Owner only
projects       Owner OR isPublic == true               Owner only (userId match)           Owner only; userId & contentHash      Owner only
                                                                                          immutable; only title, isPublic,
                                                                                          tags, updatedAt, thumbnailData
                                                                                          may change (storageURL is
                                                                                          server-managed, not client-writable)
gallery        Any authenticated user (public by       Owner only (userId match)           Owner only                            Owner only
               design — sharing = opting in)
nfts           Owner OR isListed == true               Owner only (userId match)           Owner only                            Owner only
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

[← API Reference](api.md) · [Docs Index](README.md) · [Authentication →](authentication.md)
