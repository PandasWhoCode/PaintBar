package service

import (
	"context"
	"fmt"

	"firebase.google.com/go/v4/auth"
)

// UserInfo holds the verified identity extracted from a Firebase ID token.
type UserInfo struct {
	UID   string
	Email string
}

// AuthService handles Firebase token verification.
// Coverage: thin wrapper around Firebase Admin SDK — unit-tested indirectly via
// the TokenVerifier interface mock in middleware tests. Direct coverage requires
// the Firebase Auth emulator (integration tests).
type AuthService struct {
	authClient *auth.Client
}

// NewAuthService creates a new AuthService with the given Firebase Auth client.
func NewAuthService(authClient *auth.Client) *AuthService {
	return &AuthService{authClient: authClient}
}

// VerifyIDToken verifies a Firebase ID token and returns the user's identity.
func (s *AuthService) VerifyIDToken(ctx context.Context, idToken string) (*UserInfo, error) {
	token, err := s.authClient.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("verify id token: %w", err)
	}

	email, _ := token.Claims["email"].(string)

	return &UserInfo{
		UID:   token.UID,
		Email: email,
	}, nil
}
