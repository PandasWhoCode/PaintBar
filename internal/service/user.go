package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/repository"
)

// UserService handles user profile business logic.
type UserService struct {
	repo repository.UserRepository
}

// NewUserService creates a new UserService.
func NewUserService(repo repository.UserRepository) *UserService {
	return &UserService{repo: repo}
}

// GetProfile retrieves a user profile by UID.
func (s *UserService) GetProfile(ctx context.Context, uid string) (*model.User, error) {
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	user, err := s.repo.GetByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("get profile: %w", err)
	}

	return user, nil
}

// UpdateProfile validates and applies a partial profile update.
// Only the profile owner (matching uid) may update.
func (s *UserService) UpdateProfile(ctx context.Context, requestorUID string, targetUID string, update *model.UserUpdate) error {
	if requestorUID != targetUID {
		return fmt.Errorf("unauthorized: cannot update another user's profile")
	}

	// Sanitize pointer fields
	sanitizeUpdateField(update.DisplayName)
	sanitizeUpdateField(update.Bio)
	sanitizeUpdateField(update.Location)
	sanitizeUpdateField(update.Website)
	sanitizeUpdateField(update.GithubURL)
	normalizeHandleField(update.TwitterHandle)
	normalizeHandleField(update.BlueskyHandle)
	normalizeHandleField(update.InstagramHandle)
	sanitizeUpdateField(update.HbarAddress)

	// Validate URLs if provided
	if update.Website != nil && *update.Website != "" {
		if err := validateURL(*update.Website); err != nil {
			return fmt.Errorf("invalid website URL: %w", err)
		}
	}
	if update.GithubURL != nil && *update.GithubURL != "" {
		if err := validateURL(*update.GithubURL); err != nil {
			return fmt.Errorf("invalid github URL: %w", err)
		}
	}

	// Validate field lengths
	if update.DisplayName != nil && len(*update.DisplayName) > 100 {
		return fmt.Errorf("display name must be 100 characters or less")
	}
	if update.Bio != nil && len(*update.Bio) > 500 {
		return fmt.Errorf("bio must be 500 characters or less")
	}
	if update.Location != nil && len(*update.Location) > 100 {
		return fmt.Errorf("location must be 100 characters or less")
	}

	return s.repo.Update(ctx, targetUID, update)
}

// ClaimUsername validates and atomically claims a username for a user.
func (s *UserService) ClaimUsername(ctx context.Context, uid string, username string) error {
	if uid == "" {
		return fmt.Errorf("uid is required")
	}

	username = strings.TrimSpace(strings.ToLower(username))

	if !model.UsernameRegex.MatchString(username) {
		return fmt.Errorf("username must be 3-30 lowercase alphanumeric characters, underscores, or hyphens")
	}

	// Check that user doesn't already have a username
	user, err := s.repo.GetByID(ctx, uid)
	if err != nil {
		return fmt.Errorf("get user for username claim: %w", err)
	}
	if user.Username != "" {
		return fmt.Errorf("username already set — usernames cannot be changed")
	}

	return s.repo.ClaimUsername(ctx, uid, username)
}

// sanitizeUpdateField trims whitespace on a pointer string field.
func sanitizeUpdateField(field *string) {
	if field != nil {
		*field = strings.TrimSpace(*field)
	}
}

// normalizeHandleField trims whitespace and strips leading @ from a handle field.
func normalizeHandleField(field *string) {
	if field != nil {
		*field = strings.TrimPrefix(strings.TrimSpace(*field), "@")
	}
}

// validateURL checks that a string is a valid http/https URL.
func validateURL(rawURL string) error {
	// Reuse model-level validation
	u := &model.User{UID: "tmp", Email: "tmp@tmp.com", Website: rawURL}
	return u.Validate()
}
