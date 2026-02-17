package gravatar

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestURL(t *testing.T) {
	// Known MD5: md5("test@example.com") = 55502f40dc8b7c769880b10874abc9d0
	got := URL("test@example.com", 80)
	assert.Equal(t, "https://gravatar.com/avatar/55502f40dc8b7c769880b10874abc9d0?s=80&d=404", got)
}

func TestURL_TrimsAndLowercases(t *testing.T) {
	a := URL("  Test@Example.COM  ", 200)
	b := URL("test@example.com", 200)
	assert.Equal(t, b, a)
}

func TestURL_DifferentSizes(t *testing.T) {
	url40 := URL("user@example.com", 40)
	url200 := URL("user@example.com", 200)
	assert.Contains(t, url40, "s=40")
	assert.Contains(t, url200, "s=200")
}
