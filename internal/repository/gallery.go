package repository

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"google.golang.org/api/iterator"
)

// GalleryRepository defines the interface for gallery persistence operations.
type GalleryRepository interface {
	GetByID(ctx context.Context, itemID string) (*model.GalleryItem, error)
	List(ctx context.Context, userID string, limit int, startAfter string) ([]*model.GalleryItem, error)
	Count(ctx context.Context, userID string) (int64, error)
	Create(ctx context.Context, item *model.GalleryItem) (string, error)
	Delete(ctx context.Context, itemID string) error
}

// firestoreGalleryRepo implements GalleryRepository using Firestore.
type firestoreGalleryRepo struct {
	client *firestore.Client
}

// NewGalleryRepository creates a new Firestore-backed GalleryRepository.
func NewGalleryRepository(client *firestore.Client) GalleryRepository {
	return &firestoreGalleryRepo{client: client}
}

// GetByID retrieves a gallery item by its document ID.
func (r *firestoreGalleryRepo) GetByID(ctx context.Context, itemID string) (*model.GalleryItem, error) {
	doc, err := r.client.Collection("gallery").Doc(itemID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get gallery item %s: %w", itemID, err)
	}

	var item model.GalleryItem
	if err := doc.DataTo(&item); err != nil {
		return nil, fmt.Errorf("decode gallery item %s: %w", itemID, err)
	}
	item.ID = doc.Ref.ID
	return &item, nil
}

// List retrieves gallery items for a user with cursor pagination.
func (r *firestoreGalleryRepo) List(ctx context.Context, userID string, pageLimit int, startAfter string) ([]*model.GalleryItem, error) {
	q := r.client.Collection("gallery").
		Where("userId", "==", userID).
		OrderBy("createdAt", firestore.Desc).
		Limit(pageLimit)

	if startAfter != "" {
		cursorDoc, err := r.client.Collection("gallery").Doc(startAfter).Get(ctx)
		if err != nil {
			return nil, fmt.Errorf("get cursor doc %s: %w", startAfter, err)
		}
		q = q.StartAfter(cursorDoc)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var items []*model.GalleryItem
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("iterate gallery: %w", err)
		}

		var item model.GalleryItem
		if err := doc.DataTo(&item); err != nil {
			return nil, fmt.Errorf("decode gallery item: %w", err)
		}
		item.ID = doc.Ref.ID
		items = append(items, &item)
	}

	return items, nil
}

// Count returns the total number of gallery items for a user.
func (r *firestoreGalleryRepo) Count(ctx context.Context, userID string) (int64, error) {
	q := r.client.Collection("gallery").Where("userId", "==", userID)
	results, err := q.NewAggregationQuery().WithCount("count").Get(ctx)
	if err != nil {
		return 0, fmt.Errorf("count gallery items: %w", err)
	}

	count, ok := results["count"]
	if !ok {
		return 0, nil
	}

	switch v := count.(type) {
	case int64:
		return v, nil
	case float64:
		return int64(v), nil
	default:
		return 0, fmt.Errorf("unexpected count type: %T", count)
	}
}

// Create adds a new gallery item to Firestore and returns the generated document ID.
func (r *firestoreGalleryRepo) Create(ctx context.Context, item *model.GalleryItem) (string, error) {
	item.CreatedAt = time.Now()

	ref, _, err := r.client.Collection("gallery").Add(ctx, item)
	if err != nil {
		return "", fmt.Errorf("create gallery item: %w", err)
	}

	item.ID = ref.ID
	return ref.ID, nil
}

// Delete removes a gallery item from Firestore.
func (r *firestoreGalleryRepo) Delete(ctx context.Context, itemID string) error {
	_, err := r.client.Collection("gallery").Doc(itemID).Delete(ctx)
	if err != nil {
		return fmt.Errorf("delete gallery item %s: %w", itemID, err)
	}
	return nil
}
