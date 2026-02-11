package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// --- User tests ---

func TestUser_Validate_Valid(t *testing.T) {
	u := &User{
		UID:       "abc123",
		Email:     "test@example.com",
		Username:  "cool_user-1",
		Website:   "https://example.com",
		GithubURL: "https://github.com/user",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	assert.NoError(t, u.Validate())
}

func TestUser_Validate_MissingUID(t *testing.T) {
	u := &User{Email: "test@example.com"}
	assert.ErrorContains(t, u.Validate(), "uid is required")
}

func TestUser_Validate_MissingEmail(t *testing.T) {
	u := &User{UID: "abc123"}
	assert.ErrorContains(t, u.Validate(), "email is required")
}

func TestUser_Validate_BadUsername(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com", Username: "AB"}
	assert.ErrorContains(t, u.Validate(), "username must be")
}

func TestUser_Validate_BadWebsite(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com", Website: "ftp://bad.com"}
	assert.ErrorContains(t, u.Validate(), "invalid website URL")
}

func TestUser_Validate_LongDisplayName(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com"}
	u.DisplayName = string(make([]byte, 101))
	assert.ErrorContains(t, u.Validate(), "display name must be 100")
}

func TestUser_Validate_LongBio(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com"}
	u.Bio = string(make([]byte, 501))
	assert.ErrorContains(t, u.Validate(), "bio must be 500")
}

func TestUser_Sanitize(t *testing.T) {
	u := &User{
		DisplayName:     "  Alice  ",
		Bio:             "  Hello  ",
		TwitterHandle:   "@alice",
		BlueskyHandle:   "@alice.bsky.social",
		InstagramHandle: "  @alice_art  ",
	}
	u.Sanitize()
	assert.Equal(t, "Alice", u.DisplayName)
	assert.Equal(t, "Hello", u.Bio)
	assert.Equal(t, "alice", u.TwitterHandle)
	assert.Equal(t, "alice.bsky.social", u.BlueskyHandle)
	assert.Equal(t, "alice_art", u.InstagramHandle)
}

func TestUserUpdate_ToUpdateMap(t *testing.T) {
	name := "Alice"
	bio := ""
	update := &UserUpdate{
		DisplayName: &name,
		Bio:         &bio,
	}
	m := update.ToUpdateMap()
	assert.Equal(t, "Alice", m["displayName"])
	assert.Equal(t, "", m["bio"])
	assert.Contains(t, m, "updatedAt")
	assert.NotContains(t, m, "website") // nil field not included
}

// --- Project tests ---

func TestProject_Validate_Valid(t *testing.T) {
	p := &Project{
		UserID: "user1",
		Name:   "My Art",
		Tags:   []string{"pixel", "art"},
	}
	assert.NoError(t, p.Validate())
}

func TestProject_Validate_MissingUserID(t *testing.T) {
	p := &Project{Name: "test"}
	assert.ErrorContains(t, p.Validate(), "userId is required")
}

func TestProject_Validate_MissingName(t *testing.T) {
	p := &Project{UserID: "user1", Name: "   "}
	assert.ErrorContains(t, p.Validate(), "name is required")
}

func TestProject_Validate_TooManyTags(t *testing.T) {
	p := &Project{UserID: "user1", Name: "test"}
	p.Tags = make([]string, 21)
	assert.ErrorContains(t, p.Validate(), "maximum 20 tags")
}

func TestProject_Sanitize(t *testing.T) {
	p := &Project{
		Name: "  My Art  ",
		Tags: []string{"  Pixel  ", "  ART  "},
	}
	p.Sanitize()
	assert.Equal(t, "My Art", p.Name)
	assert.Equal(t, []string{"pixel", "art"}, p.Tags)
}

// --- GalleryItem tests ---

func TestGalleryItem_Validate_Valid(t *testing.T) {
	g := &GalleryItem{UserID: "user1", Name: "Sunset"}
	assert.NoError(t, g.Validate())
}

func TestGalleryItem_Validate_MissingUserID(t *testing.T) {
	g := &GalleryItem{Name: "Sunset"}
	assert.ErrorContains(t, g.Validate(), "userId is required")
}

func TestGalleryItem_Validate_MissingName(t *testing.T) {
	g := &GalleryItem{UserID: "user1"}
	assert.ErrorContains(t, g.Validate(), "name is required")
}

func TestGalleryItem_Validate_WhitespaceName(t *testing.T) {
	g := &GalleryItem{UserID: "user1", Name: "   "}
	assert.ErrorContains(t, g.Validate(), "name is required")
}

func TestGalleryItem_Validate_LongName(t *testing.T) {
	g := &GalleryItem{UserID: "user1", Name: string(make([]byte, 201))}
	assert.ErrorContains(t, g.Validate(), "name must be 200 characters or less")
}

func TestGalleryItem_Validate_LongDescription(t *testing.T) {
	g := &GalleryItem{UserID: "user1", Name: "Art", Description: string(make([]byte, 2001))}
	assert.ErrorContains(t, g.Validate(), "description must be 2000 characters or less")
}

func TestGalleryItem_Sanitize(t *testing.T) {
	g := &GalleryItem{
		Name:        "  Sunset  ",
		Description: "  Beautiful  ",
		Tags:        []string{"  Pixel  ", "  ART  "},
	}
	g.Sanitize()
	assert.Equal(t, "Sunset", g.Name)
	assert.Equal(t, "Beautiful", g.Description)
	assert.Equal(t, []string{"pixel", "art"}, g.Tags)
}

func TestGalleryItem_Sanitize_EmptyTags(t *testing.T) {
	g := &GalleryItem{Name: "Art"}
	g.Sanitize()
	assert.Equal(t, "Art", g.Name)
}

// --- ProjectUpdate tests ---

func TestProjectUpdate_ToUpdateMap_AllFields(t *testing.T) {
	name := "New Name"
	desc := "New Desc"
	imgData := "base64data"
	thumbData := "thumbdata"
	width := 800
	height := 600
	isPublic := true
	tags := []string{"pixel", "art"}

	update := &ProjectUpdate{
		Name:          &name,
		Description:   &desc,
		ImageData:     &imgData,
		ThumbnailData: &thumbData,
		Width:         &width,
		Height:        &height,
		IsPublic:      &isPublic,
		Tags:          tags,
	}
	m := update.ToUpdateMap()
	assert.Equal(t, "New Name", m["name"])
	assert.Equal(t, "New Desc", m["description"])
	assert.Equal(t, "base64data", m["imageData"])
	assert.Equal(t, "thumbdata", m["thumbnailData"])
	assert.Equal(t, 800, m["width"])
	assert.Equal(t, 600, m["height"])
	assert.Equal(t, true, m["isPublic"])
	assert.Equal(t, []string{"pixel", "art"}, m["tags"])
	assert.Contains(t, m, "updatedAt")
}

func TestProjectUpdate_ToUpdateMap_Empty(t *testing.T) {
	update := &ProjectUpdate{}
	m := update.ToUpdateMap()
	// Only updatedAt should be present
	assert.Len(t, m, 1)
	assert.Contains(t, m, "updatedAt")
}

// --- Project validation edge cases ---

func TestProject_Validate_LongName(t *testing.T) {
	p := &Project{UserID: "user1", Name: string(make([]byte, 201))}
	assert.ErrorContains(t, p.Validate(), "name must be 200 characters or less")
}

func TestProject_Validate_LongDescription(t *testing.T) {
	p := &Project{UserID: "user1", Name: "Art", Description: string(make([]byte, 2001))}
	assert.ErrorContains(t, p.Validate(), "description must be 2000 characters or less")
}

func TestProject_Validate_LongTag(t *testing.T) {
	p := &Project{UserID: "user1", Name: "Art", Tags: []string{string(make([]byte, 51))}}
	assert.ErrorContains(t, p.Validate(), "each tag must be 50 characters or less")
}

// --- NFT tests ---

func TestNFT_Validate_Valid(t *testing.T) {
	n := &NFT{UserID: "user1", Name: "CoolNFT", Price: 10.5}
	assert.NoError(t, n.Validate())
}

func TestNFT_Validate_MissingUserID(t *testing.T) {
	n := &NFT{Name: "CoolNFT"}
	assert.ErrorContains(t, n.Validate(), "userId is required")
}

func TestNFT_Validate_MissingName(t *testing.T) {
	n := &NFT{UserID: "user1", Name: "   "}
	assert.ErrorContains(t, n.Validate(), "name is required")
}

func TestNFT_Validate_LongName(t *testing.T) {
	n := &NFT{UserID: "user1", Name: string(make([]byte, 201))}
	assert.ErrorContains(t, n.Validate(), "name must be 200 characters or less")
}

func TestNFT_Validate_NegativePrice(t *testing.T) {
	n := &NFT{UserID: "user1", Name: "Bad", Price: -1}
	assert.ErrorContains(t, n.Validate(), "price must be non-negative")
}

func TestNFT_Validate_ZeroPrice(t *testing.T) {
	n := &NFT{UserID: "user1", Name: "Free", Price: 0}
	assert.NoError(t, n.Validate())
}

func TestNFT_Sanitize(t *testing.T) {
	n := &NFT{Name: "  Cool NFT  ", Description: "  desc  "}
	n.Sanitize()
	assert.Equal(t, "Cool NFT", n.Name)
	assert.Equal(t, "desc", n.Description)
}

// --- User validation edge cases ---

func TestUser_Validate_EmptyUsername_OK(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com", Username: ""}
	assert.NoError(t, u.Validate())
}

func TestUser_Validate_LongLocation(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com", Location: string(make([]byte, 101))}
	assert.ErrorContains(t, u.Validate(), "location must be 100 characters or less")
}

func TestUser_Validate_BadGithubURL(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com", GithubURL: "ftp://github.com/user"}
	assert.ErrorContains(t, u.Validate(), "invalid github URL")
}

func TestUser_Validate_ValidGithubURL(t *testing.T) {
	u := &User{UID: "abc123", Email: "a@b.com", GithubURL: "https://github.com/user"}
	assert.NoError(t, u.Validate())
}

func TestUser_Sanitize_AllFields(t *testing.T) {
	u := &User{
		DisplayName:     "  Alice  ",
		Bio:             "  Hello  ",
		Location:        "  NYC  ",
		Website:         "  https://example.com  ",
		GithubURL:       "  https://github.com/alice  ",
		TwitterHandle:   "@alice",
		BlueskyHandle:   "@alice.bsky.social",
		InstagramHandle: "  @alice_art  ",
		HbarAddress:     "  0.0.12345  ",
	}
	u.Sanitize()
	assert.Equal(t, "Alice", u.DisplayName)
	assert.Equal(t, "Hello", u.Bio)
	assert.Equal(t, "NYC", u.Location)
	assert.Equal(t, "https://example.com", u.Website)
	assert.Equal(t, "https://github.com/alice", u.GithubURL)
	assert.Equal(t, "alice", u.TwitterHandle)
	assert.Equal(t, "alice.bsky.social", u.BlueskyHandle)
	assert.Equal(t, "alice_art", u.InstagramHandle)
	assert.Equal(t, "0.0.12345", u.HbarAddress)
}

// --- UserUpdate ToUpdateMap edge cases ---

func TestUserUpdate_ToUpdateMap_AllFields(t *testing.T) {
	name := "Alice"
	bio := "Hello"
	loc := "NYC"
	web := "https://example.com"
	gh := "https://github.com/alice"
	tw := "alice"
	bs := "alice.bsky.social"
	ig := "alice_art"
	hbar := "0.0.12345"

	update := &UserUpdate{
		DisplayName:     &name,
		Bio:             &bio,
		Location:        &loc,
		Website:         &web,
		GithubURL:       &gh,
		TwitterHandle:   &tw,
		BlueskyHandle:   &bs,
		InstagramHandle: &ig,
		HbarAddress:     &hbar,
	}
	m := update.ToUpdateMap()
	assert.Equal(t, "Alice", m["displayName"])
	assert.Equal(t, "Hello", m["bio"])
	assert.Equal(t, "NYC", m["location"])
	assert.Equal(t, "https://example.com", m["website"])
	assert.Equal(t, "https://github.com/alice", m["githubUrl"])
	assert.Equal(t, "alice", m["twitterHandle"])
	assert.Equal(t, "alice.bsky.social", m["blueskyHandle"])
	assert.Equal(t, "alice_art", m["instagramHandle"])
	assert.Equal(t, "0.0.12345", m["hbarAddress"])
	assert.Contains(t, m, "updatedAt")
}

// --- validateURL tests ---

func TestValidateURL_Valid(t *testing.T) {
	assert.NoError(t, validateURL("https://example.com"))
	assert.NoError(t, validateURL("http://example.com"))
}

func TestValidateURL_BadScheme(t *testing.T) {
	assert.ErrorContains(t, validateURL("ftp://example.com"), "http or https")
}

func TestValidateURL_NoHost(t *testing.T) {
	assert.ErrorContains(t, validateURL("https://"), "must have a host")
}

func TestValidateURL_EmptyScheme(t *testing.T) {
	assert.Error(t, validateURL("example.com"))
}

func TestValidateURL_ParseError(t *testing.T) {
	// Control characters cause url.Parse to fail
	assert.Error(t, validateURL("ht\x7ftp://bad"))
}

// --- normalizeHandle tests ---

func TestNormalizeHandle(t *testing.T) {
	assert.Equal(t, "alice", normalizeHandle("@alice"))
	assert.Equal(t, "alice", normalizeHandle("  @alice  "))
	assert.Equal(t, "alice", normalizeHandle("alice"))
	assert.Equal(t, "", normalizeHandle(""))
	assert.Equal(t, "", normalizeHandle("  "))
}
