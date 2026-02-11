package model

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// contentHashRegex matches a 64-character lowercase hex string (SHA-256).
var contentHashRegex = regexp.MustCompile(`^[0-9a-f]{64}$`)

// MaxThumbnailDataLen is the maximum allowed length of a base64 thumbnail data URL (500 KB).
const MaxThumbnailDataLen = 500 * 1024

// thumbnailDataPrefix is the required prefix for thumbnail data URLs.
const thumbnailDataPrefix = "data:image/"

// Project represents a canvas project stored in Firestore.
type Project struct {
	ID            string    `firestore:"-" json:"id"`
	UserID        string    `firestore:"userId" json:"userId"`
	Title         string    `firestore:"title" json:"title"`
	ContentHash   string    `firestore:"contentHash" json:"contentHash"`
	StorageURL    string    `firestore:"storageURL,omitempty" json:"storageURL,omitempty"`
	ThumbnailData string    `firestore:"thumbnailData,omitempty" json:"thumbnailData,omitempty"`
	Width         int       `firestore:"width,omitempty" json:"width,omitempty"`
	Height        int       `firestore:"height,omitempty" json:"height,omitempty"`
	IsPublic      bool      `firestore:"isPublic" json:"isPublic"`
	Tags          []string  `firestore:"tags,omitempty" json:"tags,omitempty"`
	CreatedAt     time.Time `firestore:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time `firestore:"updatedAt" json:"updatedAt"`
}

// ProjectUpdate represents a partial update to a project.
type ProjectUpdate struct {
	Title    *string  `firestore:"title,omitempty" json:"title,omitempty"`
	IsPublic *bool    `firestore:"isPublic,omitempty" json:"isPublic,omitempty"`
	Tags     []string `firestore:"tags,omitempty" json:"tags,omitempty"`
}

// Validate checks that the Project has required fields and valid values.
func (p *Project) Validate() error {
	if p.UserID == "" {
		return fmt.Errorf("userId is required")
	}
	if strings.TrimSpace(p.Title) == "" {
		return fmt.Errorf("title is required")
	}
	if len(p.Title) > 200 {
		return fmt.Errorf("title must be 200 characters or less")
	}
	if p.ContentHash != "" && !contentHashRegex.MatchString(p.ContentHash) {
		return fmt.Errorf("contentHash must be a 64-character lowercase hex string")
	}
	if p.ThumbnailData != "" {
		if err := ValidateThumbnailData(p.ThumbnailData); err != nil {
			return err
		}
	}
	if len(p.Tags) > 20 {
		return fmt.Errorf("maximum 20 tags allowed")
	}
	for _, tag := range p.Tags {
		if len(tag) > 50 {
			return fmt.Errorf("each tag must be 50 characters or less")
		}
	}
	return nil
}

// Sanitize cleans project input.
func (p *Project) Sanitize() {
	p.Title = strings.TrimSpace(p.Title)
	for i, tag := range p.Tags {
		p.Tags[i] = strings.TrimSpace(strings.ToLower(tag))
	}
}

// Validate checks that the ProjectUpdate has valid values.
func (p *ProjectUpdate) Validate() error {
	if p.Title != nil {
		title := strings.TrimSpace(*p.Title)
		if title == "" {
			return fmt.Errorf("title is required")
		}
		if len(title) > 200 {
			return fmt.Errorf("title must be 200 characters or less")
		}
	}
	if p.Tags != nil {
		if len(p.Tags) > 20 {
			return fmt.Errorf("maximum 20 tags allowed")
		}
		for _, tag := range p.Tags {
			if len(tag) > 50 {
				return fmt.Errorf("each tag must be 50 characters or less")
			}
		}
	}
	return nil
}

// ValidateThumbnailData checks that a thumbnail data URL is a valid data:image/ URI
// and does not exceed MaxThumbnailDataLen.
func ValidateThumbnailData(data string) error {
	if len(data) > MaxThumbnailDataLen {
		return fmt.Errorf("thumbnailData must be %d bytes or less", MaxThumbnailDataLen)
	}
	if !strings.HasPrefix(data, thumbnailDataPrefix) {
		return fmt.Errorf("thumbnailData must be a data:image/ URI")
	}
	return nil
}

// ToUpdateMap converts a ProjectUpdate to a map for Firestore partial updates.
func (p *ProjectUpdate) ToUpdateMap() map[string]interface{} {
	m := make(map[string]interface{})
	if p.Title != nil {
		m["title"] = *p.Title
	}
	if p.IsPublic != nil {
		m["isPublic"] = *p.IsPublic
	}
	if p.Tags != nil {
		m["tags"] = p.Tags
	}
	m["updatedAt"] = time.Now()
	return m
}
