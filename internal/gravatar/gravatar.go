package gravatar

import (
	"crypto/md5"
	"fmt"
	"strings"
)

// URL returns the Gravatar URL for the given email address at the specified
// pixel size. The d=404 parameter causes Gravatar to return a 404 if no
// avatar is registered, allowing the caller to fall back to a default image.
func URL(email string, size int) string {
	email = strings.TrimSpace(strings.ToLower(email))
	hash := fmt.Sprintf("%x", md5.Sum([]byte(email)))
	return fmt.Sprintf("https://gravatar.com/avatar/%s?s=%d&d=404", hash, size)
}
