package repository

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/pandasWhoCode/paintbar/internal/model"
)

// UserRepository defines the interface for user persistence operations.
type UserRepository interface {
	GetByID(ctx context.Context, uid string) (*model.User, error)
	Create(ctx context.Context, user *model.User) error
	Update(ctx context.Context, uid string, update *model.UserUpdate) error
	ClaimUsername(ctx context.Context, uid string, username string) error
}

// firestoreUserRepo implements UserRepository using Firestore.
type firestoreUserRepo struct {
	client *firestore.Client
}

// NewUserRepository creates a new Firestore-backed UserRepository.
func NewUserRepository(client *firestore.Client) UserRepository {
	return &firestoreUserRepo{client: client}
}

// GetByID retrieves a user by their Firebase UID.
func (r *firestoreUserRepo) GetByID(ctx context.Context, uid string) (*model.User, error) {
	doc, err := r.client.Collection("users").Doc(uid).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get user %s: %w", uid, err)
	}

	var user model.User
	if err := doc.DataTo(&user); err != nil {
		return nil, fmt.Errorf("decode user %s: %w", uid, err)
	}
	user.UID = uid
	return &user, nil
}

// Create creates a new user document in Firestore.
func (r *firestoreUserRepo) Create(ctx context.Context, user *model.User) error {
	now := time.Now()
	user.CreatedAt = now
	user.UpdatedAt = now

	_, err := r.client.Collection("users").Doc(user.UID).Set(ctx, user)
	if err != nil {
		return fmt.Errorf("create user %s: %w", user.UID, err)
	}
	return nil
}

// Update applies a partial update to a user document.
func (r *firestoreUserRepo) Update(ctx context.Context, uid string, update *model.UserUpdate) error {
	updates := update.ToUpdateMap()
	_, err := r.client.Collection("users").Doc(uid).Set(ctx, updates, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("update user %s: %w", uid, err)
	}
	return nil
}

// ClaimUsername atomically claims a username for a user.
// It uses a Firestore transaction to check the `usernames` collection and
// set both the username doc and the user's username field atomically.
func (r *firestoreUserRepo) ClaimUsername(ctx context.Context, uid string, username string) error {
	return r.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		usernameRef := r.client.Collection("usernames").Doc(username)
		usernameDoc, err := tx.Get(usernameRef)
		if err == nil && usernameDoc.Exists() {
			return fmt.Errorf("username %q is already taken", username)
		}

		// Claim the username
		if err := tx.Set(usernameRef, map[string]interface{}{
			"uid":       uid,
			"createdAt": time.Now(),
		}); err != nil {
			return fmt.Errorf("set username doc: %w", err)
		}

		// Update the user's username field
		userRef := r.client.Collection("users").Doc(uid)
		if err := tx.Set(userRef, map[string]interface{}{
			"username":  username,
			"updatedAt": time.Now(),
		}, firestore.MergeAll); err != nil {
			return fmt.Errorf("update user username: %w", err)
		}

		return nil
	})
}
