# Stage 1: Build Go binary
FROM golang:1.25-alpine AS go-builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/paintbar ./cmd/server

# Stage 2: Build TypeScript with esbuild (Node 24)
FROM node:24-alpine AS ts-builder

WORKDIR /app

COPY package.json ./
RUN npm install --save-dev typescript esbuild

# firebase-config.ts is gitignored but included via .dockerignore
COPY web/ts/ web/ts/

RUN npx esbuild web/ts/canvas/app.ts web/ts/auth/login.ts web/ts/profile/profile.ts web/ts/projects/projects.ts \
    --bundle --splitting --format=esm --outdir=web/static/dist --minify

# Stage 3: Minimal runtime
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy Go binary
COPY --from=go-builder /bin/paintbar /app/paintbar

# Copy static assets
COPY web/static/ /app/web/static/

# Copy esbuild-compiled TS output
COPY --from=ts-builder /app/web/static/dist/ /app/web/static/dist/

# Copy templates
COPY web/templates/ /app/web/templates/

EXPOSE 8080

ENTRYPOINT ["/app/paintbar"]
