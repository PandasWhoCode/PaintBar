package model

import (
	"fmt"
	"strings"
	"time"
)

// NFT represents an NFT stored in Firestore with Hiero network metadata.
type NFT struct {
	ID            string  `firestore:"-" json:"id"`
	UserID        string  `firestore:"userId" json:"userId"`
	Name          string  `firestore:"name" json:"name"`
	Description   string  `firestore:"description,omitempty" json:"description,omitempty"`
	ImageData     string  `firestore:"imageData,omitempty" json:"imageData,omitempty"`
	ImageURL      string  `firestore:"imageUrl,omitempty" json:"imageUrl,omitempty"`
	ThumbnailData string  `firestore:"thumbnailData,omitempty" json:"thumbnailData,omitempty"`
	Metadata      string  `firestore:"metadata,omitempty" json:"metadata,omitempty"`
	Price         float64 `firestore:"price,omitempty" json:"price,omitempty"`
	IsListed      bool    `firestore:"isListed" json:"isListed"`
	// Hiero network fields
	TokenID       string `firestore:"tokenId,omitempty" json:"tokenId,omitempty"`
	SerialNumber  int64  `firestore:"serialNumber,omitempty" json:"serialNumber,omitempty"`
	TransactionID string `firestore:"transactionId,omitempty" json:"transactionId,omitempty"`
	// Timestamps
	CreatedAt time.Time `firestore:"createdAt" json:"createdAt"`
	UpdatedAt time.Time `firestore:"updatedAt" json:"updatedAt"`
}

// Validate checks that the NFT has required fields.
func (n *NFT) Validate() error {
	if n.UserID == "" {
		return fmt.Errorf("userId is required")
	}
	if strings.TrimSpace(n.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if len(n.Name) > 200 {
		return fmt.Errorf("name must be 200 characters or less")
	}
	if n.Price < 0 {
		return fmt.Errorf("price must be non-negative")
	}
	if n.ThumbnailData != "" {
		if err := ValidateThumbnailData(n.ThumbnailData); err != nil {
			return err
		}
	}
	if n.ImageData != "" {
		if len(n.ImageData) > MaxThumbnailDataLen {
			return fmt.Errorf("imageData must be %d bytes or less", MaxThumbnailDataLen)
		}
	}
	if n.ImageURL != "" {
		if err := validateURL(n.ImageURL); err != nil {
			return fmt.Errorf("invalid image URL: %w", err)
		}
	}
	return nil
}

// Sanitize cleans NFT input.
func (n *NFT) Sanitize() {
	n.Name = strings.TrimSpace(n.Name)
	n.Description = strings.TrimSpace(n.Description)
}
