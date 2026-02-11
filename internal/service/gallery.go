package service

import (
	"context"
	"fmt"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/repository"
)

// GalleryService handles gallery business logic.
type GalleryService struct {
	repo repository.GalleryRepository
}

// NewGalleryService creates a new GalleryService.
func NewGalleryService(repo repository.GalleryRepository) *GalleryService {
	return &GalleryService{repo: repo}
}

// ListItems returns paginated gallery items for a user.
func (s *GalleryService) ListItems(ctx context.Context, uid string, limit int, startAfter string) ([]*model.GalleryItem, error) {
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

// GetItem retrieves a gallery item by ID, enforcing ownership.
func (s *GalleryService) GetItem(ctx context.Context, requestorUID string, itemID string) (*model.GalleryItem, error) {
	if itemID == "" {
		return nil, fmt.Errorf("item ID is required")
	}

	item, err := s.repo.GetByID(ctx, itemID)
	if err != nil {
		return nil, fmt.Errorf("get gallery item: %w", err)
	}

	if item.UserID != requestorUID {
		return nil, fmt.Errorf("unauthorized: you do not have access to this gallery item")
	}

	return item, nil
}

// ShareToGallery validates and creates a new gallery item.
func (s *GalleryService) ShareToGallery(ctx context.Context, uid string, item *model.GalleryItem) (string, error) {
	item.UserID = uid
	item.Sanitize()

	if err := item.Validate(); err != nil {
		return "", fmt.Errorf("validation: %w", err)
	}

	return s.repo.Create(ctx, item)
}

// DeleteItem verifies ownership and deletes a gallery item.
func (s *GalleryService) DeleteItem(ctx context.Context, requestorUID string, itemID string) error {
	if itemID == "" {
		return fmt.Errorf("item ID is required")
	}

	item, err := s.repo.GetByID(ctx, itemID)
	if err != nil {
		return fmt.Errorf("get gallery item for delete: %w", err)
	}
	if item.UserID != requestorUID {
		return fmt.Errorf("unauthorized: cannot delete another user's gallery item")
	}

	return s.repo.Delete(ctx, itemID)
}

// CountItems returns the total gallery item count for a user.
func (s *GalleryService) CountItems(ctx context.Context, uid string) (int64, error) {
	if uid == "" {
		return 0, fmt.Errorf("uid is required")
	}
	return s.repo.Count(ctx, uid)
}
