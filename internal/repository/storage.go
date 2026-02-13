package repository

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2/google"
)

// StorageService provides operations on Firebase Storage for project blobs.
// It uses the Firebase Storage REST API (firebasestorage.googleapis.com) via HTTP
// instead of the GCS Go client, because the new .firebasestorage.app bucket format
// is not accessible via the standard GCS API.
type StorageService struct {
	bucketName   string
	emulatorHost string // non-empty for local dev (e.g. "localhost:9199")
	httpClient   *http.Client
}

// NewStorageService creates a StorageService that talks to Firebase Storage via REST.
// If emulatorHost is non-empty, requests go to the emulator with no auth.
// Otherwise, requests go to firebasestorage.googleapis.com with ADC OAuth2 tokens.
func NewStorageService(bucketName, emulatorHost string) *StorageService {
	return &StorageService{
		bucketName:   bucketName,
		emulatorHost: emulatorHost,
		httpClient:   &http.Client{Timeout: 60 * time.Second},
	}
}

// baseURL returns the scheme+host for Storage API calls.
func (s *StorageService) baseURL() string {
	if s.emulatorHost != "" {
		return "http://" + s.emulatorHost
	}
	return "https://firebasestorage.googleapis.com"
}

// addAuth adds an Authorization header using Google ADC. No-op for emulator.
func (s *StorageService) addAuth(ctx context.Context, req *http.Request) error {
	if s.emulatorHost != "" {
		return nil
	}
	creds, err := google.FindDefaultCredentials(ctx, "https://www.googleapis.com/auth/firebase")
	if err != nil {
		return fmt.Errorf("find default credentials: %w", err)
	}
	token, err := creds.TokenSource.Token()
	if err != nil {
		return fmt.Errorf("get access token: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	return nil
}

// GenerateUploadURL returns a URL for direct uploads (used by emulator path only now).
func (s *StorageService) GenerateUploadURL(objectPath string, _ time.Duration) (string, error) {
	encoded := url.PathEscape(objectPath)
	return fmt.Sprintf("%s/upload/storage/v1/b/%s/o?uploadType=media&name=%s",
		s.baseURL(), s.bucketName, encoded), nil
}

// GenerateDownloadURL returns a download URL for the object.
func (s *StorageService) GenerateDownloadURL(objectPath string, _ time.Duration) (string, error) {
	encoded := url.PathEscape(objectPath)
	return fmt.Sprintf("%s/v0/b/%s/o/%s?alt=media",
		s.baseURL(), s.bucketName, encoded), nil
}

// WriteObject uploads data to the specified object path via the Firebase Storage REST API.
func (s *StorageService) WriteObject(ctx context.Context, objectPath string, data io.Reader, contentType string) error {
	encoded := url.PathEscape(objectPath)
	uploadURL := fmt.Sprintf("%s/upload/storage/v1/b/%s/o?uploadType=media&name=%s",
		s.baseURL(), s.bucketName, encoded)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, data)
	if err != nil {
		return fmt.Errorf("create upload request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)

	if err := s.addAuth(ctx, req); err != nil {
		return fmt.Errorf("auth for upload: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute upload request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("upload failed (HTTP %d): %s", resp.StatusCode, string(body))
	}
	return nil
}

// ReadObject downloads an object from Firebase Storage via the REST API.
// The caller must close the returned ReadCloser when done.
func (s *StorageService) ReadObject(ctx context.Context, objectPath string) (io.ReadCloser, error) {
	encoded := url.PathEscape(objectPath)
	downloadURL := fmt.Sprintf("%s/v0/b/%s/o/%s?alt=media",
		s.baseURL(), s.bucketName, encoded)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}

	if err := s.addAuth(ctx, req); err != nil {
		return nil, fmt.Errorf("auth for download: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute download request: %w", err)
	}

	if resp.StatusCode == http.StatusNotFound {
		resp.Body.Close()
		return nil, fmt.Errorf("object not found: %s", objectPath)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		resp.Body.Close()
		return nil, fmt.Errorf("download failed (HTTP %d): %s", resp.StatusCode, string(body))
	}
	return resp.Body, nil
}

// ObjectExists checks whether an object exists at the given path via the REST API.
func (s *StorageService) ObjectExists(ctx context.Context, objectPath string) (bool, error) {
	encoded := url.PathEscape(objectPath)
	metaURL := fmt.Sprintf("%s/v0/b/%s/o/%s",
		s.baseURL(), s.bucketName, encoded)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, metaURL, nil)
	if err != nil {
		return false, fmt.Errorf("create metadata request: %w", err)
	}

	if err := s.addAuth(ctx, req); err != nil {
		return false, fmt.Errorf("auth for metadata: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("execute metadata request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return false, fmt.Errorf("metadata check failed (HTTP %d): %s", resp.StatusCode, string(body))
	}
	return true, nil
}

// DeleteObject removes the object at the given path. Returns nil if the object
// does not exist (idempotent).
func (s *StorageService) DeleteObject(ctx context.Context, objectPath string) error {
	encoded := url.PathEscape(objectPath)
	deleteURL := fmt.Sprintf("%s/v0/b/%s/o/%s",
		s.baseURL(), s.bucketName, encoded)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, deleteURL, nil)
	if err != nil {
		return fmt.Errorf("create delete request: %w", err)
	}

	if err := s.addAuth(ctx, req); err != nil {
		return fmt.Errorf("auth for delete: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute delete request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil // idempotent
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("delete failed (HTTP %d): %s", resp.StatusCode, string(body))
	}
	return nil
}

// ProjectObjectPath returns the canonical storage path for a project's PNG blob.
// Format: projects/{userID}/{contentHash}.png
// Returns an error if either segment contains path traversal characters.
func ProjectObjectPath(userID, contentHash string) (string, error) {
	if err := validatePathSegment(userID); err != nil {
		return "", fmt.Errorf("invalid userID: %w", err)
	}
	if err := validatePathSegment(contentHash); err != nil {
		return "", fmt.Errorf("invalid contentHash: %w", err)
	}
	return fmt.Sprintf("projects/%s/%s.png", userID, contentHash), nil
}

// validatePathSegment rejects values that could escape the intended storage prefix.
func validatePathSegment(s string) error {
	if s == "" {
		return fmt.Errorf("must not be empty")
	}
	if strings.Contains(s, "/") || strings.Contains(s, "\\") || strings.Contains(s, "..") {
		return fmt.Errorf("must not contain path separators or traversal sequences")
	}
	return nil
}
