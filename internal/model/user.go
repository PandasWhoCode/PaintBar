package model

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// UsernameRegex validates username format: 3-30 chars, lowercase alphanumeric, underscores, hyphens.
var UsernameRegex = regexp.MustCompile(`^[a-z0-9_-]{3,30}$`)

// User represents a user profile stored in Firestore.
type User struct {
	UID             string    `firestore:"uid" json:"uid"`
	Email           string    `firestore:"email" json:"email"`
	Username        string    `firestore:"username,omitempty" json:"username,omitempty"`
	DisplayName     string    `firestore:"displayName,omitempty" json:"displayName,omitempty"`
	Bio             string    `firestore:"bio,omitempty" json:"bio,omitempty"`
	Location        string    `firestore:"location,omitempty" json:"location,omitempty"`
	Website         string    `firestore:"website,omitempty" json:"website,omitempty"`
	GithubURL       string    `firestore:"githubUrl,omitempty" json:"githubUrl,omitempty"`
	TwitterHandle   string    `firestore:"twitterHandle,omitempty" json:"twitterHandle,omitempty"`
	BlueskyHandle   string    `firestore:"blueskyHandle,omitempty" json:"blueskyHandle,omitempty"`
	InstagramHandle string    `firestore:"instagramHandle,omitempty" json:"instagramHandle,omitempty"`
	HbarAddress     string    `firestore:"hbarAddress,omitempty" json:"hbarAddress,omitempty"`
	UseGravatar     bool      `firestore:"useGravatar" json:"useGravatar"`
	CreatedAt       time.Time `firestore:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time `firestore:"updatedAt" json:"updatedAt"`
}

// UserUpdate represents a partial update to a user profile.
// Pointer fields allow distinguishing between "not provided" (nil) and "set to empty" ("").
type UserUpdate struct {
	DisplayName     *string `firestore:"displayName,omitempty" json:"displayName,omitempty"`
	Bio             *string `firestore:"bio,omitempty" json:"bio,omitempty"`
	Location        *string `firestore:"location,omitempty" json:"location,omitempty"`
	Website         *string `firestore:"website,omitempty" json:"website,omitempty"`
	GithubURL       *string `firestore:"githubUrl,omitempty" json:"githubUrl,omitempty"`
	TwitterHandle   *string `firestore:"twitterHandle,omitempty" json:"twitterHandle,omitempty"`
	BlueskyHandle   *string `firestore:"blueskyHandle,omitempty" json:"blueskyHandle,omitempty"`
	InstagramHandle *string `firestore:"instagramHandle,omitempty" json:"instagramHandle,omitempty"`
	HbarAddress     *string `firestore:"hbarAddress,omitempty" json:"hbarAddress,omitempty"`
	UseGravatar     *bool   `firestore:"useGravatar,omitempty" json:"useGravatar,omitempty"`
}

// Validate checks that the User struct has required fields and valid formats.
func (u *User) Validate() error {
	if u.UID == "" {
		return fmt.Errorf("uid is required")
	}
	if u.Email == "" {
		return fmt.Errorf("email is required")
	}
	if u.Username != "" && !UsernameRegex.MatchString(u.Username) {
		return fmt.Errorf("username must be 3-30 lowercase alphanumeric characters, underscores, or hyphens")
	}
	if u.Website != "" {
		if err := validateURL(u.Website); err != nil {
			return fmt.Errorf("invalid website URL: %w", err)
		}
	}
	if u.GithubURL != "" {
		if err := validateURL(u.GithubURL); err != nil {
			return fmt.Errorf("invalid github URL: %w", err)
		}
	}
	if len(u.DisplayName) > 100 {
		return fmt.Errorf("display name must be 100 characters or less")
	}
	if len(u.Bio) > 500 {
		return fmt.Errorf("bio must be 500 characters or less")
	}
	if len(u.Location) > 100 {
		return fmt.Errorf("location must be 100 characters or less")
	}
	return nil
}

// Sanitize cleans user input by trimming whitespace and normalizing handles.
func (u *User) Sanitize() {
	u.DisplayName = StripControlChars(strings.TrimSpace(u.DisplayName))
	u.Bio = StripControlChars(strings.TrimSpace(u.Bio))
	u.Location = StripControlChars(strings.TrimSpace(u.Location))
	u.Website = strings.TrimSpace(u.Website)
	u.GithubURL = strings.TrimSpace(u.GithubURL)
	u.TwitterHandle = normalizeHandle(u.TwitterHandle)
	u.BlueskyHandle = normalizeHandle(u.BlueskyHandle)
	u.InstagramHandle = normalizeHandle(u.InstagramHandle)
	u.HbarAddress = strings.TrimSpace(u.HbarAddress)
}

// ToUpdateMap converts a UserUpdate to a map for Firestore partial updates.
// Only non-nil fields are included.
func (u *UserUpdate) ToUpdateMap() map[string]interface{} {
	m := make(map[string]interface{})
	if u.DisplayName != nil {
		m["displayName"] = *u.DisplayName
	}
	if u.Bio != nil {
		m["bio"] = *u.Bio
	}
	if u.Location != nil {
		m["location"] = *u.Location
	}
	if u.Website != nil {
		m["website"] = *u.Website
	}
	if u.GithubURL != nil {
		m["githubUrl"] = *u.GithubURL
	}
	if u.TwitterHandle != nil {
		m["twitterHandle"] = *u.TwitterHandle
	}
	if u.BlueskyHandle != nil {
		m["blueskyHandle"] = *u.BlueskyHandle
	}
	if u.InstagramHandle != nil {
		m["instagramHandle"] = *u.InstagramHandle
	}
	if u.HbarAddress != nil {
		m["hbarAddress"] = *u.HbarAddress
	}
	if u.UseGravatar != nil {
		m["useGravatar"] = *u.UseGravatar
	}
	m["updatedAt"] = time.Now()
	return m
}

// normalizeHandle strips leading @ from social media handles.
func normalizeHandle(handle string) string {
	handle = strings.TrimSpace(handle)
	return strings.TrimPrefix(handle, "@")
}

// StripControlChars removes C0 control characters (U+0000–U+001F except space
// U+0020) and the C1 range (U+007F–U+009F) from s. This prevents social-
// engineering attacks via newlines/tabs in confirm() dialogs, log injection,
// and null-byte truncation.
func StripControlChars(s string) string {
	return strings.Map(func(r rune) rune {
		if r == ' ' {
			return r
		}
		if r <= 0x1F || (r >= 0x7F && r <= 0x9F) {
			return -1 // drop
		}
		return r
	}, s)
}

// validateURL checks that a string is a valid http/https URL.
func validateURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URL must use http or https scheme")
	}
	if u.Host == "" {
		return fmt.Errorf("URL must have a host")
	}
	return nil
}
