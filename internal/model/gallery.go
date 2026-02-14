package model

import (
	"fmt"
	"strings"
	"time"
)

// GalleryItem represents an artwork shared to the public gallery in Firestore.
type GalleryItem struct {
	ID            string    `firestore:"-" json:"id"`
	UserID        string    `firestore:"userId" json:"userId"`
	ProjectID     string    `firestore:"projectId,omitempty" json:"projectId,omitempty"`
	Name          string    `firestore:"name" json:"name"`
	Description   string    `firestore:"description,omitempty" json:"description,omitempty"`
	ImageData     string    `firestore:"imageData,omitempty" json:"imageData,omitempty"`
	ThumbnailData string    `firestore:"thumbnailData,omitempty" json:"thumbnailData,omitempty"`
	Width         int       `firestore:"width,omitempty" json:"width,omitempty"`
	Height        int       `firestore:"height,omitempty" json:"height,omitempty"`
	Tags          []string  `firestore:"tags,omitempty" json:"tags,omitempty"`
	CreatedAt     time.Time `firestore:"createdAt" json:"createdAt"`
}

// Validate checks that the GalleryItem has required fields.
func (g *GalleryItem) Validate() error {
	if g.UserID == "" {
		return fmt.Errorf("userId is required")
	}
	if strings.TrimSpace(g.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if len(g.Name) > 200 {
		return fmt.Errorf("name must be 200 characters or less")
	}
	if len(g.Description) > 2000 {
		return fmt.Errorf("description must be 2000 characters or less")
	}
	if g.ThumbnailData != "" {
		if err := ValidateThumbnailData(g.ThumbnailData); err != nil {
			return err
		}
	}
	if g.ImageData != "" {
		if len(g.ImageData) > MaxThumbnailDataLen {
			return fmt.Errorf("imageData must be %d bytes or less", MaxThumbnailDataLen)
		}
		if !strings.HasPrefix(g.ImageData, thumbnailDataPrefix) {
			return fmt.Errorf("imageData must be a data:image/ URI")
		}
	}
	return nil
}

// Sanitize cleans gallery item input.
func (g *GalleryItem) Sanitize() {
	g.Name = strings.TrimSpace(g.Name)
	g.Description = strings.TrimSpace(g.Description)
	for i, tag := range g.Tags {
		g.Tags[i] = strings.TrimSpace(strings.ToLower(tag))
	}
}
