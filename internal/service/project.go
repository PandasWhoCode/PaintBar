package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/repository"
)

// DefaultPageSize is the default number of items per page.
const DefaultPageSize = 10

// MaxPageSize is the maximum allowed page size.
const MaxPageSize = 50

// StorageClient abstracts the storage operations needed by ProjectService.
// This allows unit testing without a real GCS bucket.
type StorageClient interface {
	GenerateUploadURL(objectPath string, expiry time.Duration) (string, error)
	GenerateDownloadURL(objectPath string, expiry time.Duration) (string, error)
	ObjectExists(ctx context.Context, objectPath string) (bool, error)
	ReadObject(ctx context.Context, objectPath string) (io.ReadCloser, error)
	WriteObject(ctx context.Context, objectPath string, data io.Reader, contentType string) error
	DeleteObject(ctx context.Context, objectPath string) error
}

// CreateProjectResult is returned by CreateProject with the project ID.
type CreateProjectResult struct {
	ProjectID string `json:"projectId"`
	Duplicate bool   `json:"duplicate"`
}

// ProjectService handles project business logic.
type ProjectService struct {
	repo    repository.ProjectRepository
	storage StorageClient
}

// NewProjectService creates a new ProjectService.
// storage may be nil if Storage is not yet configured (existing CRUD still works).
func NewProjectService(repo repository.ProjectRepository, storage StorageClient) *ProjectService {
	return &ProjectService{repo: repo, storage: storage}
}

// ListProjects returns paginated projects for a user.
func (s *ProjectService) ListProjects(ctx context.Context, uid string, limit int, startAfter string) ([]*model.Project, error) {
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	if limit <= 0 {
		limit = DefaultPageSize
	}
	if limit > MaxPageSize {
		limit = MaxPageSize
	}

	return s.repo.List(ctx, uid, limit, startAfter)
}

// GetProject retrieves a project by ID, enforcing ownership or public visibility.
func (s *ProjectService) GetProject(ctx context.Context, requestorUID string, projectID string) (*model.Project, error) {
	if projectID == "" {
		return nil, fmt.Errorf("project ID is required")
	}

	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}

	// Allow access if owner or if project is public
	if project.UserID != requestorUID && !project.IsPublic {
		return nil, fmt.Errorf("unauthorized: you do not have access to this project")
	}

	return project, nil
}

// CreateProject validates, dedup-checks, creates or upserts a Firestore record,
// and returns a signed upload URL so the client can PUT the PNG blob directly.
//
// Upsert logic (titles are unique per user):
//  1. Same content hash already exists → return Duplicate=true, no upload.
//  2. Same title already exists → update the existing project's content hash,
//     generate a new upload URL, return the existing project ID.
//  3. Otherwise → create a new project.
func (s *ProjectService) CreateProject(ctx context.Context, uid string, project *model.Project) (*CreateProjectResult, error) {
	project.UserID = uid
	project.StorageURL = "" // Never trust client-supplied storageURL
	project.Sanitize()

	if err := project.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}

	// Dedup check: same user + same content hash → return existing project
	if project.ContentHash != "" {
		existing, err := s.repo.FindByContentHash(ctx, uid, project.ContentHash)
		if err != nil {
			return nil, fmt.Errorf("dedup check: %w", err)
		}
		if existing != nil {
			return &CreateProjectResult{
				ProjectID: existing.ID,
				Duplicate: true,
			}, nil
		}
	}

	// Title upsert: if a project with this title already exists, update it
	existing, err := s.repo.FindByTitle(ctx, uid, project.Title)
	if err != nil {
		return nil, fmt.Errorf("title lookup: %w", err)
	}
	if existing != nil {
		err = s.repo.UpdateRaw(ctx, existing.ID, map[string]interface{}{
			"contentHash":   project.ContentHash,
			"storageURL":    "",
			"thumbnailData": project.ThumbnailData,
			"width":         project.Width,
			"height":        project.Height,
			"isPublic":      project.IsPublic,
			"tags":          project.Tags,
			"updatedAt":     time.Now(),
		})
		if err != nil {
			return nil, fmt.Errorf("upsert project: %w", err)
		}
		return &CreateProjectResult{
			ProjectID: existing.ID,
		}, nil
	}

	// Create a new Firestore record (StorageURL will be set after upload confirmation)
	id, err := s.repo.Create(ctx, project)
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	return &CreateProjectResult{
		ProjectID: id,
	}, nil
}

// GetProjectByTitle retrieves a project by user ID and title.
func (s *ProjectService) GetProjectByTitle(ctx context.Context, requestorUID, title string) (*model.Project, error) {
	if title == "" {
		return nil, fmt.Errorf("title is required")
	}

	project, err := s.repo.FindByTitle(ctx, requestorUID, title)
	if err != nil {
		return nil, fmt.Errorf("find project by title: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}

	return project, nil
}

// ConfirmUpload verifies that the blob was uploaded to Storage and sets the
// StorageURL on the project record. Called by the client after a successful PUT.
func (s *ProjectService) ConfirmUpload(ctx context.Context, requestorUID, projectID string) error {
	if projectID == "" {
		return fmt.Errorf("project ID is required")
	}
	if s.storage == nil {
		return fmt.Errorf("storage is not configured")
	}

	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return fmt.Errorf("get project for confirm: %w", err)
	}
	if project.UserID != requestorUID {
		return fmt.Errorf("unauthorized: cannot confirm another user's project")
	}
	if project.ContentHash == "" {
		return fmt.Errorf("project has no content hash")
	}

	objectPath, err := repository.ProjectObjectPath(requestorUID, project.ContentHash)
	if err != nil {
		return fmt.Errorf("build object path: %w", err)
	}

	exists, err := s.storage.ObjectExists(ctx, objectPath)
	if err != nil {
		return fmt.Errorf("check upload: %w", err)
	}
	if !exists {
		return fmt.Errorf("upload not found: blob has not been uploaded yet")
	}

	// Generate a long-lived download URL (7 days; frontend can refresh)
	downloadURL, err := s.storage.GenerateDownloadURL(objectPath, 7*24*time.Hour)
	if err != nil {
		return fmt.Errorf("generate download url: %w", err)
	}

	err = s.repo.UpdateRaw(ctx, projectID, map[string]interface{}{
		"storageURL": downloadURL,
		"updatedAt":  time.Now(),
	})
	if err != nil {
		return fmt.Errorf("set storage url: %w", err)
	}

	return nil
}

// allowedStorageHosts lists the hostnames that storageURL may point to.
// This prevents a regression from ever setting storageURL to an attacker-
// controlled domain (phishing, data exfiltration).
var allowedStorageHosts = []string{
	"firebasestorage.googleapis.com",
	"localhost",
	"127.0.0.1",
}

// validateStorageURL checks that a generated download URL points to an
// allowed Firebase Storage host. Returns an error if the URL is malformed
// or points to an unexpected domain.
func validateStorageURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("malformed storage URL: %w", err)
	}
	host := strings.Split(u.Hostname(), ":")[0]
	for _, allowed := range allowedStorageHosts {
		if host == allowed {
			return nil
		}
	}
	return fmt.Errorf("storage URL host %q is not in the allow-list", u.Hostname())
}

// pngMagic is the 8-byte PNG file signature.
var pngMagic = []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}

// UploadBlob writes the PNG blob to Storage and updates the project's storageURL.
// This replaces the old signed-URL + confirm-upload two-step flow.
func (s *ProjectService) UploadBlob(ctx context.Context, requestorUID, projectID string, data io.Reader) error {
	if projectID == "" {
		return fmt.Errorf("project ID is required")
	}
	if s.storage == nil {
		return fmt.Errorf("storage is not configured")
	}

	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return fmt.Errorf("get project for upload: %w", err)
	}
	if project.UserID != requestorUID {
		return fmt.Errorf("unauthorized: cannot upload to another user's project")
	}
	if project.ContentHash == "" {
		return fmt.Errorf("project has no content hash")
	}

	// Validate PNG magic bytes before uploading
	header := make([]byte, 8)
	n, err := io.ReadFull(data, header)
	if err != nil || n < 8 {
		return fmt.Errorf("invalid upload: unable to read file header")
	}
	if !bytes.Equal(header, pngMagic) {
		return fmt.Errorf("invalid upload: file is not a valid PNG image")
	}
	// Reconstitute the full stream: header bytes + remaining body
	fullData := io.MultiReader(bytes.NewReader(header), data)

	objectPath, err := repository.ProjectObjectPath(requestorUID, project.ContentHash)
	if err != nil {
		return fmt.Errorf("build object path: %w", err)
	}

	if err := s.storage.WriteObject(ctx, objectPath, fullData, "image/png"); err != nil {
		return fmt.Errorf("write blob: %w", err)
	}

	// Generate a long-lived download URL (7 days; frontend can refresh)
	downloadURL, err := s.storage.GenerateDownloadURL(objectPath, 7*24*time.Hour)
	if err != nil {
		return fmt.Errorf("generate download url: %w", err)
	}
	if err := validateStorageURL(downloadURL); err != nil {
		return fmt.Errorf("upload blob: %w", err)
	}

	err = s.repo.UpdateRaw(ctx, projectID, map[string]interface{}{
		"storageURL": downloadURL,
		"updatedAt":  time.Now(),
	})
	if err != nil {
		return fmt.Errorf("set storage url: %w", err)
	}

	return nil
}

// DownloadBlob returns a streaming reader for the project's PNG blob from Storage
// after verifying ownership. The caller must close the returned ReadCloser.
func (s *ProjectService) DownloadBlob(ctx context.Context, requestorUID, projectID string) (io.ReadCloser, error) {
	if projectID == "" {
		return nil, fmt.Errorf("project ID is required")
	}
	if s.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}

	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project for download: %w", err)
	}
	if project.UserID != requestorUID {
		return nil, fmt.Errorf("unauthorized: cannot download another user's project")
	}
	if project.ContentHash == "" {
		return nil, fmt.Errorf("project has no content hash")
	}

	objectPath, err := repository.ProjectObjectPath(requestorUID, project.ContentHash)
	if err != nil {
		return nil, fmt.Errorf("build object path: %w", err)
	}

	reader, err := s.storage.ReadObject(ctx, objectPath)
	if err != nil {
		return nil, fmt.Errorf("read blob: %w", err)
	}
	return reader, nil
}

// UpdateProject validates ownership and applies a partial update.
func (s *ProjectService) UpdateProject(ctx context.Context, requestorUID string, projectID string, update *model.ProjectUpdate) error {
	if projectID == "" {
		return fmt.Errorf("project ID is required")
	}

	if err := update.Validate(); err != nil {
		return fmt.Errorf("validation: %w", err)
	}

	// Verify ownership
	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return fmt.Errorf("get project for update: %w", err)
	}
	if project.UserID != requestorUID {
		return fmt.Errorf("unauthorized: cannot update another user's project")
	}

	return s.repo.Update(ctx, projectID, update)
}

// DeleteProject verifies ownership, deletes the Storage blob, and removes
// the Firestore record.
func (s *ProjectService) DeleteProject(ctx context.Context, requestorUID string, projectID string) error {
	if projectID == "" {
		return fmt.Errorf("project ID is required")
	}

	// Verify ownership
	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return fmt.Errorf("get project for delete: %w", err)
	}
	if project.UserID != requestorUID {
		return fmt.Errorf("unauthorized: cannot delete another user's project")
	}

	// Delete the Storage blob (best-effort; idempotent)
	if s.storage != nil && project.ContentHash != "" {
		objectPath, pathErr := repository.ProjectObjectPath(requestorUID, project.ContentHash)
		if pathErr == nil {
			_ = s.storage.DeleteObject(ctx, objectPath)
		}
	}

	return s.repo.Delete(ctx, projectID)
}

// CountProjects returns the total project count for a user.
func (s *ProjectService) CountProjects(ctx context.Context, uid string) (int64, error) {
	if uid == "" {
		return 0, fmt.Errorf("uid is required")
	}
	return s.repo.Count(ctx, uid)
}
