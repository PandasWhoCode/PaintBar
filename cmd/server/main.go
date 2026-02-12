package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/pandasWhoCode/paintbar/api"
	"github.com/pandasWhoCode/paintbar/internal/config"
	"github.com/pandasWhoCode/paintbar/internal/handler"
	mw "github.com/pandasWhoCode/paintbar/internal/middleware"
	"github.com/pandasWhoCode/paintbar/internal/repository"
	"github.com/pandasWhoCode/paintbar/internal/service"
	"github.com/pandasWhoCode/paintbar/web"
)

// Coverage: application entry point — not unit-testable. Exercised by
// integration tests and manual verification via `task run`.
func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Set up structured logging
	logLevel := slog.LevelInfo
	if cfg.Env == "local" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	slog.Info("starting paintbar server",
		"env", cfg.Env,
		"port", cfg.Port,
	)

	// Initialize Firebase clients
	ctx := context.Background()
	fbClients, err := repository.NewFirebaseClients(ctx,
		cfg.FirebaseProjectID,
		cfg.FirebaseServiceAccountPath,
		cfg.FirebaseStorageBucket,
		cfg.FirestoreEmulatorHost,
		cfg.FirebaseAuthEmulatorHost,
		cfg.FirebaseStorageEmulatorHost,
	)
	if err != nil {
		slog.Error("failed to initialize firebase", "error", err)
		os.Exit(1)
	}
	defer fbClients.Close()

	// Initialize Firestore repositories
	userRepo := repository.NewUserRepository(fbClients.Firestore)
	projectRepo := repository.NewProjectRepository(fbClients.Firestore)
	galleryRepo := repository.NewGalleryRepository(fbClients.Firestore)
	nftRepo := repository.NewNFTRepository(fbClients.Firestore)

	// Initialize Storage service
	storageSvc := repository.NewStorageService(fbClients.Storage, cfg.FirebaseStorageBucket, cfg.FirebaseStorageEmulatorHost)

	// Initialize services
	authService := service.NewAuthService(fbClients.Auth)
	userService := service.NewUserService(userRepo)
	projectService := service.NewProjectService(projectRepo, storageSvc)
	galleryService := service.NewGalleryService(galleryRepo)
	nftService := service.NewNFTService(nftRepo)

	// Initialize handlers
	profileHandler := handler.NewProfileHandler(userService)
	projectHandler := handler.NewProjectHandler(projectService)
	galleryHandler := handler.NewGalleryHandler(galleryService)
	nftHandler := handler.NewNFTHandler(nftService)
	docsHandler := handler.NewDocsHandler(api.OpenAPISpec)

	// Initialize template renderer
	renderer, err := handler.NewTemplateRenderer(web.TemplatesFS)
	if err != nil {
		slog.Error("failed to parse templates", "error", err)
		os.Exit(1)
	}
	pageHandler := handler.NewPageHandler(renderer, cfg.Env)

	// Set up rate limiters (relaxed in local env for development)
	rateLimiter := mw.NewRateLimiter(100, time.Minute)
	sensitiveRate := 20
	if cfg.Env == "local" {
		sensitiveRate = 60
	}
	sensitiveLimiter := mw.NewRateLimiter(sensitiveRate, time.Minute)

	// Set up router
	r := chi.NewRouter()

	// Global middleware stack (order matters)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(mw.Recovery(logger))
	r.Use(mw.SecurityHeaders(cfg.Env))
	r.Use(mw.RequestLogger(logger))
	r.Use(rateLimiter.Handler())

	// Static files (directory listing disabled)
	fileServer := http.FileServer(http.Dir("web/static"))
	r.Handle("/static/*", http.StripPrefix("/static/", noDirListing(fileServer)))

	// Favicon (browsers request /favicon.ico at root)
	r.Get("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/static/images/favicon.ico")
	})

	// Page routes (SSR via Go templates)
	r.Get("/", pageHandler.Login)
	r.Get("/login", pageHandler.Login)
	r.Get("/profile", pageHandler.Profile)
	r.Get("/canvas", pageHandler.Canvas)
	r.NotFound(pageHandler.NotFound)

	// Health check (no rate limiting, no auth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		fsStatus := "ok"
		if err := repository.FirestoreHealthCheck(r.Context(), fbClients.Firestore); err != nil {
			slog.Error("health check: firestore", "error", err)
			fsStatus = "error"
		}

		json.NewEncoder(w).Encode(map[string]string{
			"status":    "ok",
			"firestore": fsStatus,
		})
	})

	// API docs (Swagger UI) — disabled in production
	if !cfg.IsProduction() {
		r.Get("/api/docs", docsHandler.ServeUI)
		r.Get("/api/docs/openapi.yaml", docsHandler.ServeSpec)
		r.Get("/api/docs/init.js", docsHandler.ServeInitJS)
	}

	// API routes with CORS and auth
	r.Route("/api", func(r chi.Router) {
		r.Use(mw.CORS(mw.DefaultCORSConfig(cfg.Env)))
		r.Use(mw.Auth(authService))

		r.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintln(w, `{"data":"pong"}`)
		})

		// Profile
		r.Get("/profile", profileHandler.GetProfile)
		r.Put("/profile", profileHandler.UpdateProfile)
		r.With(mw.SensitiveEndpoint(sensitiveLimiter)).Post("/claim-username", profileHandler.ClaimUsername)

		// Projects
		r.Get("/projects", projectHandler.ListProjects)
		r.With(mw.SensitiveEndpoint(sensitiveLimiter)).Post("/projects", projectHandler.CreateProject)
		r.Get("/projects/count", projectHandler.CountProjects)
		r.Get("/projects/by-title", projectHandler.GetProjectByTitle)
		r.Get("/projects/{id}", projectHandler.GetProject)
		r.Put("/projects/{id}", projectHandler.UpdateProject)
		r.Delete("/projects/{id}", projectHandler.DeleteProject)
		r.With(mw.SensitiveEndpoint(sensitiveLimiter)).Post("/projects/{id}/confirm-upload", projectHandler.ConfirmUpload)
		r.Get("/projects/{id}/blob", projectHandler.DownloadBlob)

		// Gallery
		r.Get("/gallery", galleryHandler.ListItems)
		r.Post("/gallery", galleryHandler.ShareToGallery)
		r.Get("/gallery/count", galleryHandler.CountItems)
		r.Get("/gallery/{id}", galleryHandler.GetItem)
		r.Delete("/gallery/{id}", galleryHandler.DeleteItem)

		// NFTs
		r.Get("/nfts", nftHandler.ListNFTs)
		r.Post("/nfts", nftHandler.CreateNFT)
		r.Get("/nfts/count", nftHandler.CountNFTs)
		r.Get("/nfts/{id}", nftHandler.GetNFT)
		r.Delete("/nfts/{id}", nftHandler.DeleteNFT)
	})

	// Create HTTP server
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server listen error", "error", err)
			os.Exit(1)
		}
	}()

	slog.Info("server started", "addr", srv.Addr)

	<-done
	slog.Info("server shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped gracefully")
}

// noDirListing wraps an http.Handler to return 404 for directory requests,
// preventing exposure of application file structure.
func noDirListing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
