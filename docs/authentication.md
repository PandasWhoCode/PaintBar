# Authentication

[← Database](database.md) · [Docs Index](README.md) · [Frontend →](frontend.md)

## Overview

PaintBar uses **Firebase Authentication** for identity management with a split client/server verification model:

- **Client-side**: Firebase Auth SDK handles sign-in (Google, email/password) and provides ID tokens
- **Server-side**: Go middleware verifies ID tokens using the Firebase Admin SDK

## Authentication Flow

```text
┌──────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Browser  │     │  Firebase Auth   │     │   Go Server      │
│           │     │  (Google Cloud)  │     │   (Cloud Run)    │
└─────┬─────┘     └────────┬─────────┘     └────────┬─────────┘
      │                    │                        │
      │  1. Sign in        │                        │
      │  (Google/email)    │                        │
      │───────────────────▶│                        │
      │                    │                        │
      │  2. ID Token       │                        │
      │◀───────────────────│                        │
      │                    │                        │
      │  3. API request    │                        │
      │  Authorization:    │                        │
      │  Bearer <token>    │                        │
      │────────────────────┼───────────────────────▶│
      │                    │                        │
      │                    │  4. Verify token       │
      │                    │◀───────────────────────│
      │                    │                        │
      │                    │  5. Token valid        │
      │                    │  (UID + email)         │
      │                    │───────────────────────▶│
      │                    │                        │
      │                    │           6. Extract UID, inject
      │                    │              into request context
      │                    │                        │
      │  7. JSON response  │                        │
      │◀───────────────────┼────────────────────────│
      │                    │                        │
```

## Client-Side Auth

### Firebase Initialization

Firebase is initialized in `web/ts/shared/firebase-init.ts` with the project
config from `firebase-config.ts` (gitignored, generated from template).

```typescript
// firebase-init.ts
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { firebaseConfig } from "./firebase-config";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export { onAuthStateChanged };
```

### Auth Gates

Protected pages use `onAuthStateChanged` to redirect unauthenticated users:

```typescript
// In canvas app.ts DOMContentLoaded
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("/login"); // replace prevents back-button trap
    return;
  }
  // User is authenticated — show the app
});
```

### API Calls with Token

```typescript
const token = await auth.currentUser.getIdToken();
const response = await fetch("/api/profile", {
  headers: { Authorization: `Bearer ${token}` },
});
```

## Server-Side Auth

### Auth Middleware

Defined in `internal/middleware/auth.go`. Applied to all `/api/*` routes.

```text
Request → Auth Middleware → Handler
                │
                ├── Skip paths: /, /health, /favicon.ico, /static/*
                │
                ├── Extract "Bearer <token>" from Authorization header
                │
                ├── Verify token via Firebase Admin SDK
                │   └── Returns UID + email
                │
                ├── Inject UserInfo into request context
                │
                └── Pass to next handler
```

### Key Types

```go
// TokenVerifier interface (enables mock testing)
type TokenVerifier interface {
    VerifyIDToken(ctx context.Context, idToken string) (*service.UserInfo, error)
}

// UserInfo — extracted from verified token
type UserInfo struct {
    UID   string
    Email string
}

// Context key for authenticated user
const UserContextKey contextKey = "user"
```

### Extracting the User in Handlers

```go
func (h *ProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
    user := requireUser(w, r)  // returns nil + writes 401 if not authenticated
    if user == nil {
        return
    }
    // user.UID and user.Email are available
}
```

`requireUser()` calls `middleware.UserFromContext(r.Context())` which extracts the `UserInfo` injected by the auth middleware.

### Skip Paths

The auth middleware skips these paths (no token required):

| Path           | Reason                          |
| -------------- | ------------------------------- |
| `/`            | Login page (SSR)                |
| `/health`      | Health check endpoint           |
| `/favicon.ico` | Browser favicon request         |
| `/static/*`    | Static assets (CSS, JS, images) |

All other paths (including `/api/*`) require a valid Bearer token.

## Firebase Admin SDK

The Go server initializes Firebase clients in `internal/repository/firestore.go`:

| Environment    | Auth Method                                            |
| -------------- | ------------------------------------------------------ |
| **Local**      | Emulator (`FIREBASE_AUTH_EMULATOR_HOST`)               |
| **Preview**    | Application Default Credentials (ADC on Cloud Run)     |
| **Production** | Service account JSON (`FIREBASE_SERVICE_ACCOUNT_PATH`) |

### Emulator Configuration

In local development, the Firebase Auth emulator runs at `localhost:9099`
(Docker Compose). The Go server auto-configures the emulator host
when `ENV=local`.

## Error Responses

| Scenario                                | Status | Error Message                           |
| --------------------------------------- | ------ | --------------------------------------- |
| Missing `Authorization` header          | 401    | `"missing authorization header"`        |
| Malformed header (not `Bearer <token>`) | 401    | `"invalid authorization header format"` |
| Empty token                             | 401    | `"empty token"`                         |
| Invalid/expired token                   | 401    | `"invalid or expired token"`            |
| Auth service not configured (nil)       | 500    | `"authentication service unavailable"`  |

## Rate Limiting on Sensitive Endpoints

Sensitive endpoints have an additional rate limiter (20 req/min, 60 in
local dev) applied via `mw.SensitiveEndpoint(sensitiveLimiter)`. This is layered
on top of the global rate limiter.

```go
r.With(mw.SensitiveEndpoint(sensitiveLimiter)).Post("/claim-username", profileHandler.ClaimUsername)
```

Sensitive endpoints: `POST /api/claim-username`, `POST /api/projects`,
`POST /api/projects/{id}/upload-blob`, `POST /api/projects/{id}/confirm-upload`.

### Rate Limit Keying

The sensitive endpoint limiter uses a **compound key** of UID + IP when the user
is authenticated (`uid:<UID>|<IP>`), falling back to IP-only for unauthenticated
requests. This prevents a single user from bypassing limits by rotating IPs.

### IP Extraction

The rate limiter extracts the client IP from `RemoteAddr` (set correctly by
Cloud Run). It only falls back to the `X-Real-IP` header when `RemoteAddr` is a
loopback address (local development behind a proxy). This prevents rate-limit
bypass via header spoofing in production.

---

[← Database](database.md) · [Docs Index](README.md) · [Frontend →](frontend.md)
