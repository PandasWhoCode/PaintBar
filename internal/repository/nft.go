package repository

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"google.golang.org/api/iterator"
)

// NFTRepository defines the interface for NFT persistence operations.
type NFTRepository interface {
	GetByID(ctx context.Context, nftID string) (*model.NFT, error)
	List(ctx context.Context, userID string, limit int, startAfter string) ([]*model.NFT, error)
	Count(ctx context.Context, userID string) (int64, error)
	Create(ctx context.Context, nft *model.NFT) (string, error)
	Update(ctx context.Context, nftID string, updates map[string]interface{}) error
	Delete(ctx context.Context, nftID string) error
}

// firestoreNFTRepo implements NFTRepository using Firestore.
type firestoreNFTRepo struct {
	client *firestore.Client
}

// NewNFTRepository creates a new Firestore-backed NFTRepository.
func NewNFTRepository(client *firestore.Client) NFTRepository {
	return &firestoreNFTRepo{client: client}
}

// GetByID retrieves an NFT by its document ID.
func (r *firestoreNFTRepo) GetByID(ctx context.Context, nftID string) (*model.NFT, error) {
	doc, err := r.client.Collection("nfts").Doc(nftID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get nft %s: %w", nftID, err)
	}

	var nft model.NFT
	if err := doc.DataTo(&nft); err != nil {
		return nil, fmt.Errorf("decode nft %s: %w", nftID, err)
	}
	nft.ID = doc.Ref.ID
	return &nft, nil
}

// List retrieves NFTs for a user with cursor pagination.
func (r *firestoreNFTRepo) List(ctx context.Context, userID string, pageLimit int, startAfter string) ([]*model.NFT, error) {
	q := r.client.Collection("nfts").
		Where("userId", "==", userID).
		OrderBy("createdAt", firestore.Desc).
		Limit(pageLimit)

	if startAfter != "" {
		cursorDoc, err := r.client.Collection("nfts").Doc(startAfter).Get(ctx)
		if err != nil {
			return nil, fmt.Errorf("get cursor doc %s: %w", startAfter, err)
		}
		q = q.StartAfter(cursorDoc)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var nfts []*model.NFT
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("iterate nfts: %w", err)
		}

		var nft model.NFT
		if err := doc.DataTo(&nft); err != nil {
			return nil, fmt.Errorf("decode nft: %w", err)
		}
		nft.ID = doc.Ref.ID
		nfts = append(nfts, &nft)
	}

	return nfts, nil
}

// Count returns the total number of NFTs for a user.
func (r *firestoreNFTRepo) Count(ctx context.Context, userID string) (int64, error) {
	q := r.client.Collection("nfts").Where("userId", "==", userID)
	results, err := q.NewAggregationQuery().WithCount("count").Get(ctx)
	if err != nil {
		return 0, fmt.Errorf("count nfts: %w", err)
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

// Create adds a new NFT to Firestore and returns the generated document ID.
func (r *firestoreNFTRepo) Create(ctx context.Context, nft *model.NFT) (string, error) {
	now := time.Now()
	nft.CreatedAt = now
	nft.UpdatedAt = now

	ref, _, err := r.client.Collection("nfts").Add(ctx, nft)
	if err != nil {
		return "", fmt.Errorf("create nft: %w", err)
	}

	nft.ID = ref.ID
	return ref.ID, nil
}

// Update applies a partial update to an NFT document.
func (r *firestoreNFTRepo) Update(ctx context.Context, nftID string, updates map[string]interface{}) error {
	updates["updatedAt"] = time.Now()
	_, err := r.client.Collection("nfts").Doc(nftID).Set(ctx, updates, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("update nft %s: %w", nftID, err)
	}
	return nil
}

// Delete removes an NFT document from Firestore.
func (r *firestoreNFTRepo) Delete(ctx context.Context, nftID string) error {
	_, err := r.client.Collection("nfts").Doc(nftID).Delete(ctx)
	if err != nil {
		return fmt.Errorf("delete nft %s: %w", nftID, err)
	}
	return nil
}
