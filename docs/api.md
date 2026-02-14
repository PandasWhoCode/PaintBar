# API Reference

[← Project Structure](project-structure.md) · [Docs Index](README.md) · [Database →](database.md)

> **Full OpenAPI 3.1 spec**: [`api/openapi.yaml`](../api/openapi.yaml)
>
> **Swagger UI** (local/preview only): `http://localhost:8080/api/docs`

## Base URL

| Environment | URL                                                 |
| ----------- | --------------------------------------------------- |
| Local       | `http://localhost:8080`                             |
| Production  | `https://paintbar-461183067730.us-central1.run.app` |

## Authentication

All `/api/*` endpoints require a Firebase ID token in the `Authorization` header:

```text
Authorization: Bearer <firebase-id-token>
```

The token is obtained client-side via the Firebase Auth SDK and verified
server-side by the Go middleware using the Firebase Admin SDK.
See [Authentication](authentication.md) for details.

**Exceptions** (no auth required):

- `GET /health`
- `GET /` , `/login`, `/profile`, `/canvas` (SSR pages)
- `GET /static/*` (static assets)
- `GET /favicon.ico`

## Response Format

### Success

```json
// Single resource
{ "uid": "abc123", "email": "user@example.com", ... }

// List
[{ "id": "doc1", ... }, { "id": "doc2", ... }]

// Mutation
{ "status": "updated" }
{ "id": "new-doc-id" }
{ "status": "deleted" }
{ "count": 5 }
```

### Error

```json
{ "error": "human-readable error message" }
```

HTTP status codes are mapped from error message patterns:

| Pattern                                                      | Status                                   |
| ------------------------------------------------------------ | ---------------------------------------- |
| `"not found"`                                                | 404                                      |
| `"unauthorized"`                                             | 403                                      |
| `"already taken"` / `"already set"` / `"already exists"`     | 409                                      |
| `"is required"` / `"validation"` / `"must be"` / `"invalid"` | 400                                      |
| Everything else                                              | 500 (generic message returned to client) |

## Pagination

List endpoints support cursor-based pagination:

| Parameter    | Type    | Default | Description                           |
| ------------ | ------- | ------- | ------------------------------------- |
| `limit`      | integer | 10      | Items per page (1–50)                 |
| `startAfter` | string  | —       | Document ID cursor from previous page |

```text
GET /api/projects?limit=20&startAfter=abc123
```

---

## Endpoints

### Health

#### `GET /health`

No authentication required.

**Response** `200`

```json
{
  "status": "ok",
  "db": "ok",
  "firestore": "ok"
}
```

---

### Profile

#### `GET /api/profile`

Get the authenticated user's profile. Creates a new profile document if one doesn't exist.

**Response** `200`

```json
{
  "uid": "firebase-uid",
  "email": "user@example.com",
  "username": "cool_artist",
  "displayName": "Cool Artist",
  "bio": "I make pixel art",
  "location": "Portland, OR",
  "website": "https://example.com",
  "githubUrl": "https://github.com/user",
  "twitterHandle": "user",
  "blueskyHandle": "user.bsky.social",
  "instagramHandle": "user",
  "hbarAddress": "0.0.12345",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-06-01T00:00:00Z"
}
```

#### `PUT /api/profile`

Partial update — only provided fields are changed. Pointer semantics: omitted fields are untouched, `""` clears a field.

**Request Body**

```json
{
  "displayName": "New Name",
  "bio": "Updated bio"
}
```

**Response** `200`

```json
{ "status": "updated" }
```

#### `POST /api/claim-username`

Atomically claim a username. Immutable once set. Rate limited to **5 requests/minute**.

**Request Body**

```json
{ "username": "cool_artist" }
```

**Validation**: `^[a-z0-9_-]{3,30}$`

**Response** `200`

```json
{ "status": "claimed", "username": "cool_artist" }
```

**Errors**: `400` (invalid format), `409` (already taken), `429` (rate limited)

---

### Projects

#### `GET /api/projects`

List the authenticated user's projects (ordered by `createdAt` desc).

**Query**: `?limit=10&startAfter=docId`

**Response** `200`: Array of `Project` objects.

#### `POST /api/projects`

Create or upsert a project. **Titles are unique per user.**

- If a project with the same `contentHash` exists → returns `duplicate: true`, no upload.
- If a project with the same `title` exists → updates its content (upsert).
- Otherwise → creates a new project.

After creating/upserting, the client uploads the PNG blob via `POST /api/projects/{id}/upload-blob`.

**Request Body**

```json
{
  "title": "My Artwork",
  "contentHash": "a1b2c3d4e5f6...64-char-hex-sha256",
  "thumbnailData": "data:image/png;base64,...",
  "width": 800,
  "height": 600,
  "isPublic": false,
  "tags": ["landscape", "pixel-art"]
}
```

**Required**: `title`, `contentHash`, `thumbnailData`, `width`, `height`

**Response** `201`

```json
{
  "projectId": "new-or-existing-project-id",
  "duplicate": false
}
```

If `duplicate` is `true`, no upload is needed and `projectId` refers to the
existing project with the same `contentHash`.

#### `GET /api/projects/by-title`

Look up a project by title for the authenticated user.

**Query**: `?title=My+Artwork`

**Response** `200`: `Project` object.

**Errors**: `400` (missing title), `404` (not found)

#### `POST /api/projects/{id}/upload-blob`

Upload the project's full-resolution PNG blob. The server writes it to Firebase Storage
server-side (avoids CORS issues with direct browser-to-Storage uploads).

The server validates the PNG file signature (magic bytes) and rejects non-PNG
uploads with a `400` error.

**Request**: `image/png` binary body (max 10 MB)

**Response** `200`

```json
{ "status": "uploaded" }
```

#### `POST /api/projects/{id}/confirm-upload`

Called after the client successfully uploads the PNG blob via `upload-blob`.
Verifies the object exists in Storage and sets the `storageURL` on the project record.

**Response** `200`

```json
{ "status": "confirmed" }
```

#### `GET /api/projects/{id}/blob`

Download the project's full-resolution PNG. Streams the blob from Storage through the
API (avoids CORS issues with direct Storage URLs).

Response headers include `Content-Disposition: inline; filename="canvas.png"` and
`Cache-Control: no-store`.

**Response** `200`: `image/png` binary

#### `GET /api/projects/count`

**Response** `200`

```json
{ "count": 12 }
```

#### `GET /api/projects/{id}`

Get a single project. Must be the owner or the project must be public.

#### `PUT /api/projects/{id}`

Partial update. Must be the owner.

#### `DELETE /api/projects/{id}`

Delete a project. Must be the owner.

**Response** `200`

```json
{ "status": "deleted" }
```

---

### Gallery

Gallery items are publicly visible to all authenticated users (sharing is an explicit opt-in action).

#### `GET /api/gallery`

List the authenticated user's gallery items.

#### `POST /api/gallery`

Share artwork to the public gallery.

**Request Body**

```json
{
  "name": "Sunset Pixel Art",
  "description": "A beautiful sunset",
  "projectId": "source-project-id",
  "imageData": "data:image/png;base64,...",
  "thumbnailData": "data:image/png;base64,...",
  "width": 800,
  "height": 600,
  "tags": ["sunset"]
}
```

**Required**: `name`

#### `GET /api/gallery/count`

#### `GET /api/gallery/{id}`

#### `DELETE /api/gallery/{id}`

Same patterns as Projects.

---

### NFTs

NFT records stored in Firestore. On-chain minting via Hiero network is TBD.

#### `GET /api/nfts`

List the authenticated user's NFTs.

#### `POST /api/nfts`

Create an NFT record.

**Request Body**

```json
{
  "name": "Rare Panda #1",
  "description": "Limited edition pixel panda",
  "imageData": "data:image/png;base64,...",
  "price": 10.5
}
```

**Required**: `name`

#### `GET /api/nfts/count`

#### `GET /api/nfts/{id}`

#### `DELETE /api/nfts/{id}`

Same patterns as Projects. Listed NFTs (`isListed: true`) are readable by any authenticated user.

---

## Rate Limiting

| Scope              | Limit        | Window   |
| ------------------ | ------------ | -------- |
| **Global** per IP  | 100 requests | 1 minute |
| **Sensitive** (\*) | 20 requests  | 1 minute |

\* Sensitive endpoints: `POST /api/claim-username`, `POST /api/projects`, `POST /api/projects/{id}/upload-blob`, `POST /api/projects/{id}/confirm-upload`

Rate-limited responses return `429 Too Many Requests` with a `Retry-After: 60` header.

## Request Size Limit

Request bodies are limited to **1 MB** (`maxRequestBodySize`). Exceeding this returns `413 Request Entity Too Large`.

## JSON Request Parsing

The server uses `json.Decoder.DisallowUnknownFields()` — any JSON request
containing fields not defined in the target struct will be rejected with a `400`
error. This prevents mass-assignment attacks.

## Security Headers

All responses include:

| Header                      | Value                                      |
| --------------------------- | ------------------------------------------ |
| `X-Frame-Options`           | `DENY`                                     |
| `X-Content-Type-Options`    | `nosniff`                                  |
| `X-XSS-Protection`          | `0` (rely on CSP)                          |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`          |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy`   | See [Architecture](architecture.md)        |
| `Strict-Transport-Security` | Production only: `max-age=63072000`        |
| `Cache-Control`             | `no-store` (API responses)                 |

---

[← Project Structure](project-structure.md) · [Docs Index](README.md) · [Database →](database.md)
