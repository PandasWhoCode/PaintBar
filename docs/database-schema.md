# PaintBar Database Schema (Legacy)

[← Back to Docs](README.md)

> **Note**: This is the original pre-migration schema reference.
> For the current schema, see [Database](database.md).

This document defines the Firestore database schema for the PaintBar application.

## Collections Overview

- `users` - User profiles and account information
- `projects` - User's saved drawing projects
- `gallery` - Public gallery items shared by users
- `nfts` - NFTs minted through PaintBar on the Hedera network

---

## Collection: `users`

**Path:** `/users/{userId}`

User profile documents. The `userId` is the Firebase Auth UID.

### Fields

| Field             | Type      | Required | Description                                 |
| ----------------- | --------- | -------- | ------------------------------------------- |
| `uid`             | string    | Yes      | Firebase Auth user ID (matches document ID) |
| `email`           | string    | Yes      | User's email address from Firebase Auth     |
| `username`        | string    | No       | Unique username (defaults to email prefix)  |
| `displayName`     | string    | No       | User's display name                         |
| `bio`             | string    | No       | User biography/description                  |
| `location`        | string    | No       | User's location                             |
| `website`         | string    | No       | User's personal website URL                 |
| `githubUrl`       | string    | No       | GitHub profile URL                          |
| `twitterHandle`   | string    | No       | Twitter/X handle (with or without @)        |
| `blueskyHandle`   | string    | No       | Bluesky handle                              |
| `instagramHandle` | string    | No       | Instagram handle                            |
| `hbarAddress`     | string    | No       | Hedera HBAR wallet address                  |
| `createdAt`       | timestamp | Yes      | Account creation timestamp                  |
| `updatedAt`       | timestamp | Yes      | Last profile update timestamp               |

### Security Rules

- **Read:** Any authenticated user
- **Write:** Only the document owner (userId matches auth.uid)

### Example Document

```json
{
  "uid": "abc123xyz",
  "email": "artist@example.com",
  "username": "artist",
  "displayName": "Amazing Artist",
  "bio": "Digital artist and NFT creator",
  "location": "San Francisco, CA",
  "website": "https://myart.com",
  "githubUrl": "https://github.com/artist",
  "twitterHandle": "@artist",
  "blueskyHandle": "@artist.bsky.social",
  "instagramHandle": "@artist",
  "hbarAddress": "0.0.123456",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-20T14:45:00Z"
}
```

---

## Collection: `projects`

**Path:** `/projects/{projectId}`

User's saved drawing projects from the canvas.

### Fields

| Field           | Type      | Required | Description                                  |
| --------------- | --------- | -------- | -------------------------------------------- |
| `userId`        | string    | Yes      | Owner's Firebase Auth UID                    |
| `title`         | string    | Yes      | Project title                                |
| `contentHash`   | string    | Yes      | SHA-256 hex of canvas PNG (64 chars)         |
| `storageURL`    | string    | No       | Firebase Storage download URL                |
| `thumbnailData` | string    | No       | Thumbnail for grid display (200px max edge)  |
| `width`         | number    | Yes      | Canvas width in pixels                       |
| `height`        | number    | Yes      | Canvas height in pixels                      |
| `isPublic`      | boolean   | No       | Whether project is visible in public gallery |
| `tags`          | array     | No       | Array of tag strings                         |
| `createdAt`     | timestamp | Yes      | Project creation timestamp                   |
| `updatedAt`     | timestamp | Yes      | Last modification timestamp                  |

### Security Rules

- **Read:** Any authenticated user
- **Write:** Only if authenticated AND userId matches auth.uid
- **Create:** Only if authenticated AND userId in document matches auth.uid

### Indexes Required

- `userId` (ascending) + `createdAt` (descending) - For user's project list
- `isPublic` (ascending) + `createdAt` (descending) - For public gallery

---

## Collection: `gallery`

**Path:** `/gallery/{itemId}`

Public gallery items shared by users.

### Fields

| Field          | Type      | Required | Description                   |
| -------------- | --------- | -------- | ----------------------------- |
| `userId`       | string    | Yes      | Creator's Firebase Auth UID   |
| `projectId`    | string    | Yes      | Reference to original project |
| `name`         | string    | Yes      | Gallery item name             |
| `description`  | string    | No       | Item description              |
| `imageUrl`     | string    | Yes      | Public image URL              |
| `thumbnailUrl` | string    | No       | Thumbnail URL                 |
| `likes`        | number    | No       | Number of likes (default: 0)  |
| `views`        | number    | No       | Number of views (default: 0)  |
| `tags`         | array     | No       | Array of tag strings          |
| `createdAt`    | timestamp | Yes      | When shared to gallery        |
| `updatedAt`    | timestamp | Yes      | Last update timestamp         |

### Security Rules

- **Read:** Any authenticated user
- **Write:** Only if authenticated AND userId matches auth.uid
- **Create:** Only if authenticated AND userId in document matches auth.uid

### Indexes Required

- `createdAt` (descending) - For recent gallery items
- `likes` (descending) - For popular items
- `userId` (ascending) + `createdAt` (descending) - For user's gallery items

---

## Collection: `nfts`

**Path:** `/nfts/{nftId}`

NFTs minted through PaintBar on the Hedera network.

### Fields

| Field           | Type      | Required | Description                    |
| --------------- | --------- | -------- | ------------------------------ |
| `userId`        | string    | Yes      | Creator's Firebase Auth UID    |
| `projectId`     | string    | Yes      | Reference to original project  |
| `tokenId`       | string    | Yes      | Hedera token ID                |
| `serialNumber`  | number    | Yes      | NFT serial number              |
| `name`          | string    | Yes      | NFT name                       |
| `description`   | string    | No       | NFT description                |
| `imageUrl`      | string    | Yes      | IPFS or public image URL       |
| `metadata`      | object    | No       | Additional NFT metadata        |
| `price`         | number    | No       | Listing price in HBAR          |
| `isListed`      | boolean   | No       | Whether NFT is listed for sale |
| `mintedAt`      | timestamp | Yes      | Minting timestamp              |
| `transactionId` | string    | Yes      | Hedera transaction ID          |
| `createdAt`     | timestamp | Yes      | Document creation timestamp    |
| `updatedAt`     | timestamp | Yes      | Last update timestamp          |

### Security Rules

- **Read:** Any authenticated user
- **Write:** Only if authenticated AND userId matches auth.uid
- **Create:** Only if authenticated AND userId in document matches auth.uid

### Indexes Required

- `userId` (ascending) + `mintedAt` (descending) - For user's NFTs
- `isListed` (ascending) + `price` (ascending) - For marketplace
- `mintedAt` (descending) - For recent NFTs

---

## Data Type Conventions

- **Timestamps:** Use Firestore `Timestamp` type (auto-converts to/from JavaScript `Date`)
- **User References:** Always use Firebase Auth UID (string)
- **URLs:** Store as strings, validate format in application
- **Arrays:** Use Firestore array type for tags and lists
- **Numbers:** Use Firestore number type (handles integers and doubles)

---

## Migration Notes

### Resolved (2025-02-09)

- TypeScript types aligned with schema
- `githubProfiles` subcollection removed in favor of single `githubUrl` field on user document
- `bio`, `location`, `website` fields added to form and save logic
- All field names consistent across types, schema, and JS

---

## Future Enhancements

- Add `followers` and `following` subcollections for social features
- Add `comments` subcollection for gallery items
- Add `transactions` collection for marketplace activity
- Add `notifications` collection for user alerts
