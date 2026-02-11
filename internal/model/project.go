package model

import (
	"fmt"
	"strings"
	"time"
)

// Project represents a canvas project stored in Firestore.
type Project struct {
	ID            string    `firestore:"-" json:"id"`
	UserID        string    `firestore:"userId" json:"userId"`
	Name          string    `firestore:"name" json:"name"`
	Description   string    `firestore:"description,omitempty" json:"description,omitempty"`
	ImageData     string    `firestore:"imageData,omitempty" json:"imageData,omitempty"`
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
	Name          *string  `firestore:"name,omitempty" json:"name,omitempty"`
	Description   *string  `firestore:"description,omitempty" json:"description,omitempty"`
	ImageData     *string  `firestore:"imageData,omitempty" json:"imageData,omitempty"`
	ThumbnailData *string  `firestore:"thumbnailData,omitempty" json:"thumbnailData,omitempty"`
	Width         *int     `firestore:"width,omitempty" json:"width,omitempty"`
	Height        *int     `firestore:"height,omitempty" json:"height,omitempty"`
	IsPublic      *bool    `firestore:"isPublic,omitempty" json:"isPublic,omitempty"`
	Tags          []string `firestore:"tags,omitempty" json:"tags,omitempty"`
}

// Validate checks that the Project has required fields and valid values.
func (p *Project) Validate() error {
	if p.UserID == "" {
		return fmt.Errorf("userId is required")
	}
	if strings.TrimSpace(p.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if len(p.Name) > 200 {
		return fmt.Errorf("name must be 200 characters or less")
	}
	if len(p.Description) > 2000 {
		return fmt.Errorf("description must be 2000 characters or less")
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
	p.Name = strings.TrimSpace(p.Name)
	p.Description = strings.TrimSpace(p.Description)
	for i, tag := range p.Tags {
		p.Tags[i] = strings.TrimSpace(strings.ToLower(tag))
	}
}

// ToUpdateMap converts a ProjectUpdate to a map for Firestore partial updates.
func (p *ProjectUpdate) ToUpdateMap() map[string]interface{} {
	m := make(map[string]interface{})
	if p.Name != nil {
		m["name"] = *p.Name
	}
	if p.Description != nil {
		m["description"] = *p.Description
	}
	if p.ImageData != nil {
		m["imageData"] = *p.ImageData
	}
	if p.ThumbnailData != nil {
		m["thumbnailData"] = *p.ThumbnailData
	}
	if p.Width != nil {
		m["width"] = *p.Width
	}
	if p.Height != nil {
		m["height"] = *p.Height
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
