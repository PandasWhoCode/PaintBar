package repository

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// --- Helper function unit tests (no external deps) ---

func TestIsNotFoundError_Nil(t *testing.T) {
	assert.False(t, isNotFoundError(nil))
}

func TestIsNotFoundError_NotFound(t *testing.T) {
	assert.True(t, isNotFoundError(fmt.Errorf("rpc error: code = NotFound")))
}

func TestIsNotFoundError_NotFoundLower(t *testing.T) {
	assert.True(t, isNotFoundError(fmt.Errorf("document not found")))
}

func TestIsNotFoundError_OtherError(t *testing.T) {
	assert.False(t, isNotFoundError(fmt.Errorf("permission denied")))
}

func TestContains(t *testing.T) {
	assert.True(t, contains("hello world", "world"))
	assert.True(t, contains("hello", "hello"))
	assert.False(t, contains("hi", "hello"))
	assert.False(t, contains("", "a"))
	assert.True(t, contains("a", "a"))
}

func TestSearchString(t *testing.T) {
	assert.True(t, searchString("abcdef", "cde"))
	assert.True(t, searchString("abc", "abc"))
	assert.False(t, searchString("abc", "xyz"))
	assert.True(t, searchString("aaa", "a"))
}

func TestFirebaseClients_Close_Nil(t *testing.T) {
	fc := &FirebaseClients{}
	err := fc.Close()
	assert.NoError(t, err)
}

// --- Storage helper tests ---

func TestProjectObjectPath(t *testing.T) {
	path, err := ProjectObjectPath("user123", "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")
	assert.NoError(t, err)
	assert.Equal(t, "projects/user123/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890.png", path)
}

func TestProjectObjectPath_Format(t *testing.T) {
	path, err := ProjectObjectPath("uid1", "hash1")
	assert.NoError(t, err)
	assert.Equal(t, "projects/uid1/hash1.png", path)
}

func TestProjectObjectPath_EmptyUserID(t *testing.T) {
	_, err := ProjectObjectPath("", "hash1")
	assert.ErrorContains(t, err, "invalid userID")
}

func TestProjectObjectPath_EmptyContentHash(t *testing.T) {
	_, err := ProjectObjectPath("uid1", "")
	assert.ErrorContains(t, err, "invalid contentHash")
}

func TestProjectObjectPath_TraversalInUserID(t *testing.T) {
	_, err := ProjectObjectPath("../etc", "hash1")
	assert.ErrorContains(t, err, "path separators or traversal")
}

func TestProjectObjectPath_SlashInUserID(t *testing.T) {
	_, err := ProjectObjectPath("user/evil", "hash1")
	assert.ErrorContains(t, err, "path separators or traversal")
}

func TestProjectObjectPath_BackslashInContentHash(t *testing.T) {
	_, err := ProjectObjectPath("uid1", "hash\\evil")
	assert.ErrorContains(t, err, "path separators or traversal")
}

func TestProjectObjectPath_TraversalInContentHash(t *testing.T) {
	_, err := ProjectObjectPath("uid1", "..somehash")
	assert.ErrorContains(t, err, "path separators or traversal")
}

func TestNewStorageService(t *testing.T) {
	svc := NewStorageService("test-bucket", "")
	assert.NotNil(t, svc)
}

func TestStorageService_EmulatorUploadURL(t *testing.T) {
	svc := NewStorageService("my-bucket.appspot.com", "localhost:9199")
	url, err := svc.GenerateUploadURL("projects/uid1/abc123.png", 15*time.Minute)
	assert.NoError(t, err)
	assert.Equal(t, "http://localhost:9199/upload/storage/v1/b/my-bucket.appspot.com/o?uploadType=media&name=projects%2Fuid1%2Fabc123.png", url)
}

func TestStorageService_EmulatorDownloadURL(t *testing.T) {
	svc := NewStorageService("my-bucket.appspot.com", "localhost:9199")
	url, err := svc.GenerateDownloadURL("projects/uid1/abc123.png", 15*time.Minute)
	assert.NoError(t, err)
	assert.Equal(t, "http://localhost:9199/v0/b/my-bucket.appspot.com/o/projects%2Fuid1%2Fabc123.png?alt=media", url)
}

func TestValidatePathSegment(t *testing.T) {
	assert.NoError(t, validatePathSegment("valid-segment"))
	assert.NoError(t, validatePathSegment("abc123"))
	assert.Error(t, validatePathSegment(""))
	assert.Error(t, validatePathSegment("a/b"))
	assert.Error(t, validatePathSegment("a\\b"))
	assert.Error(t, validatePathSegment(".."))
	assert.Error(t, validatePathSegment("a..b"))
}
