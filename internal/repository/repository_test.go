package repository

import (
	"fmt"
	"testing"

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
