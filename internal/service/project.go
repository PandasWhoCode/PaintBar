package service

import (
	"context"
	"fmt"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/repository"
)

// DefaultPageSize is the default number of items per page.
const DefaultPageSize = 10

// MaxPageSize is the maximum allowed page size.
const MaxPageSize = 50

// ProjectService handles project business logic.
type ProjectService struct {
	repo repository.ProjectRepository
}

// NewProjectService creates a new ProjectService.
func NewProjectService(repo repository.ProjectRepository) *ProjectService {
	return &ProjectService{repo: repo}
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

// CreateProject validates and creates a new project.
func (s *ProjectService) CreateProject(ctx context.Context, uid string, project *model.Project) (string, error) {
	project.UserID = uid
	project.Sanitize()

	if err := project.Validate(); err != nil {
		return "", fmt.Errorf("validation: %w", err)
	}

	return s.repo.Create(ctx, project)
}

// UpdateProject validates ownership and applies a partial update.
func (s *ProjectService) UpdateProject(ctx context.Context, requestorUID string, projectID string, update *model.ProjectUpdate) error {
	if projectID == "" {
		return fmt.Errorf("project ID is required")
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

// DeleteProject verifies ownership and deletes a project.
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

	return s.repo.Delete(ctx, projectID)
}

// CountProjects returns the total project count for a user.
func (s *ProjectService) CountProjects(ctx context.Context, uid string) (int64, error) {
	if uid == "" {
		return 0, fmt.Errorf("uid is required")
	}
	return s.repo.Count(ctx, uid)
}
