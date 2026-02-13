package repository

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	gcs "cloud.google.com/go/storage"
)

// StorageService provides operations on Firebase/Cloud Storage for project blobs.
type StorageService struct {
	bucket       *gcs.BucketHandle
	bucketName   string
	emulatorHost string
}

// NewStorageService creates a StorageService backed by the given bucket.
// If emulatorHost is non-empty (e.g. "localhost:9199"), the service generates
// direct emulator URLs instead of V4 signed URLs.
func NewStorageService(bucket *gcs.BucketHandle, bucketName, emulatorHost string) *StorageService {
	return &StorageService{bucket: bucket, bucketName: bucketName, emulatorHost: emulatorHost}
}

// GenerateUploadURL creates a V4-signed URL that allows a client to PUT a PNG
// blob directly to Cloud Storage. The URL is scoped to the given object path
// and expires after the specified duration.
//
// When running against the Firebase Storage emulator, signed URLs are not
// supported, so a direct emulator upload URL is returned instead.
func (s *StorageService) GenerateUploadURL(objectPath string, expiry time.Duration) (string, error) {
	if s.emulatorHost != "" {
		return s.emulatorUploadURL(objectPath), nil
	}
	url, err := s.bucket.SignedURL(objectPath, &gcs.SignedURLOptions{
		Method:      "PUT",
		Expires:     time.Now().Add(expiry),
		ContentType: "image/png",
		Scheme:      gcs.SigningSchemeV4,
	})
	if err != nil {
		return "", fmt.Errorf("generate upload signed url: %w", err)
	}
	return url, nil
}

// GenerateDownloadURL creates a V4-signed URL that allows anyone to GET the
// object for the specified duration.
//
// When running against the Firebase Storage emulator, a direct emulator URL
// is returned instead of a signed URL.
func (s *StorageService) GenerateDownloadURL(objectPath string, expiry time.Duration) (string, error) {
	if s.emulatorHost != "" {
		return s.emulatorObjectURL(objectPath), nil
	}
	url, err := s.bucket.SignedURL(objectPath, &gcs.SignedURLOptions{
		Method:  "GET",
		Expires: time.Now().Add(expiry),
		Scheme:  gcs.SigningSchemeV4,
	})
	if err != nil {
		return "", fmt.Errorf("generate download signed url: %w", err)
	}
	return url, nil
}

// emulatorUploadURL returns the Firebase Storage emulator upload endpoint.
// Format: http://{emulatorHost}/upload/storage/v1/b/{bucket}/o?uploadType=media&name={path}
// The client must POST (not PUT) to this URL with the file body.
func (s *StorageService) emulatorUploadURL(objectPath string) string {
	encoded := strings.ReplaceAll(objectPath, "/", "%2F")
	return fmt.Sprintf("http://%s/upload/storage/v1/b/%s/o?uploadType=media&name=%s", s.emulatorHost, s.bucketName, encoded)
}

// emulatorObjectURL returns a direct URL to an object in the Firebase Storage emulator.
// Format: http://{emulatorHost}/v0/b/{bucket}/o/{urlEncodedPath}?alt=media
func (s *StorageService) emulatorObjectURL(objectPath string) string {
	encoded := strings.ReplaceAll(objectPath, "/", "%2F")
	return fmt.Sprintf("http://%s/v0/b/%s/o/%s?alt=media", s.emulatorHost, s.bucketName, encoded)
}

// WriteObject writes data from the given reader to the specified object path
// in Storage. The content type is set on the object metadata.
func (s *StorageService) WriteObject(ctx context.Context, objectPath string, data io.Reader, contentType string) error {
	writer := s.bucket.Object(objectPath).NewWriter(ctx)
	writer.ContentType = contentType
	if _, err := io.Copy(writer, data); err != nil {
		writer.Close()
		return fmt.Errorf("write object data: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("finalize object write: %w", err)
	}
	return nil
}

// ReadObject opens a streaming reader for an object in Storage.
// The caller must close the returned ReadCloser when done.
func (s *StorageService) ReadObject(ctx context.Context, objectPath string) (io.ReadCloser, error) {
	reader, err := s.bucket.Object(objectPath).NewReader(ctx)
	if err != nil {
		return nil, fmt.Errorf("open object for read: %w", err)
	}
	return reader, nil
}

// ObjectExists checks whether an object exists at the given path.
func (s *StorageService) ObjectExists(ctx context.Context, objectPath string) (bool, error) {
	_, err := s.bucket.Object(objectPath).Attrs(ctx)
	if err == gcs.ErrObjectNotExist {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check object exists: %w", err)
	}
	return true, nil
}

// DeleteObject removes the object at the given path. Returns nil if the object
// does not exist (idempotent).
func (s *StorageService) DeleteObject(ctx context.Context, objectPath string) error {
	err := s.bucket.Object(objectPath).Delete(ctx)
	if err == gcs.ErrObjectNotExist {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
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
