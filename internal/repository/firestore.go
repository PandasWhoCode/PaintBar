package repository

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

// FirebaseClients holds the initialized Firebase Auth and Firestore clients.
type FirebaseClients struct {
	Auth      *auth.Client
	Firestore *firestore.Client
	app       *firebase.App
}

// NewFirebaseClients initializes the Firebase Admin SDK and returns Auth + Firestore clients.
// In local mode, it connects to the emulators via environment variables.
// In preview/production, it uses the service account credentials file.
// Coverage: requires Firebase emulator — tested via integration tests.
func NewFirebaseClients(ctx context.Context, projectID, serviceAccountPath, firestoreEmulatorHost, authEmulatorHost string) (*FirebaseClients, error) {
	var app *firebase.App
	var err error

	conf := &firebase.Config{ProjectID: projectID}

	if serviceAccountPath != "" {
		// Production / Preview: use service account
		app, err = firebase.NewApp(ctx, conf, option.WithCredentialsFile(serviceAccountPath))
	} else {
		// Local: connect to emulators (no credentials needed)
		// Set emulator env vars so the SDK auto-discovers them
		if firestoreEmulatorHost != "" {
			os.Setenv("FIRESTORE_EMULATOR_HOST", firestoreEmulatorHost)
		}
		if authEmulatorHost != "" {
			os.Setenv("FIREBASE_AUTH_EMULATOR_HOST", authEmulatorHost)
		}
		app, err = firebase.NewApp(ctx, conf)
	}

	if err != nil {
		return nil, fmt.Errorf("initialize firebase app: %w", err)
	}

	authClient, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("initialize firebase auth client: %w", err)
	}

	fsClient, err := app.Firestore(ctx)
	if err != nil {
		return nil, fmt.Errorf("initialize firestore client: %w", err)
	}

	slog.Info("firebase clients initialized",
		"project_id", projectID,
		"emulator_firestore", firestoreEmulatorHost,
		"emulator_auth", authEmulatorHost,
	)

	return &FirebaseClients{
		Auth:      authClient,
		Firestore: fsClient,
		app:       app,
	}, nil
}

// Close shuts down the Firestore client.
func (fc *FirebaseClients) Close() error {
	if fc.Firestore != nil {
		return fc.Firestore.Close()
	}
	return nil
}

// FirestoreHealthCheck verifies the Firestore connection by reading a non-existent doc.
func FirestoreHealthCheck(ctx context.Context, client *firestore.Client) error {
	// Attempt to read a health-check doc; a "not found" error means the connection works.
	_, err := client.Collection("_health").Doc("ping").Get(ctx)
	if err != nil {
		// "NotFound" is expected and means the connection is healthy
		if isNotFoundError(err) {
			return nil
		}
		return fmt.Errorf("firestore health check: %w", err)
	}
	return nil
}

// isNotFoundError checks if the error is a Firestore "not found" error.
func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	// google.golang.org/grpc/status codes: NotFound = 5
	return contains(err.Error(), "NotFound") || contains(err.Error(), "not found")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
