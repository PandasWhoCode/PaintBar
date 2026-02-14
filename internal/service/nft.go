package service

import (
	"context"
	"fmt"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/repository"
)

// NFTService handles NFT business logic.
// Hiero SDK integration (minting, transfers) will be added after thorough
// study of hiero-go-sdk and Solo docs.
type NFTService struct {
	repo repository.NFTRepository
}

// NewNFTService creates a new NFTService.
func NewNFTService(repo repository.NFTRepository) *NFTService {
	return &NFTService{repo: repo}
}

// ListNFTs returns paginated NFTs for a user.
func (s *NFTService) ListNFTs(ctx context.Context, uid string, limit int, startAfter string) ([]*model.NFT, error) {
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	if limit <= 0 {
		limit = DefaultPageSize
	}
	if limit > MaxPageSize {
		limit = MaxPageSize
	}

	return s.repo.List(ctx, uid, limit, startAfter)
}

// GetNFT retrieves an NFT by ID, enforcing ownership.
func (s *NFTService) GetNFT(ctx context.Context, requestorUID string, nftID string) (*model.NFT, error) {
	if nftID == "" {
		return nil, fmt.Errorf("NFT ID is required")
	}

	nft, err := s.repo.GetByID(ctx, nftID)
	if err != nil {
		return nil, fmt.Errorf("get NFT: %w", err)
	}

	if nft.UserID != requestorUID {
		return nil, fmt.Errorf("unauthorized: you do not have access to this NFT")
	}

	return nft, nil
}

// CreateNFT validates and creates a new NFT record in Firestore.
// Note: This does NOT mint on-chain. Hiero minting will be added later.
func (s *NFTService) CreateNFT(ctx context.Context, uid string, nft *model.NFT) (string, error) {
	nft.UserID = uid
	nft.TokenID = ""
	nft.SerialNumber = 0
	nft.TransactionID = ""
	nft.Sanitize()

	if err := nft.Validate(); err != nil {
		return "", fmt.Errorf("validation: %w", err)
	}

	return s.repo.Create(ctx, nft)
}

// DeleteNFT verifies ownership and deletes an NFT record.
func (s *NFTService) DeleteNFT(ctx context.Context, requestorUID string, nftID string) error {
	if nftID == "" {
		return fmt.Errorf("NFT ID is required")
	}

	nft, err := s.repo.GetByID(ctx, nftID)
	if err != nil {
		return fmt.Errorf("get NFT for delete: %w", err)
	}
	if nft.UserID != requestorUID {
		return fmt.Errorf("unauthorized: cannot delete another user's NFT")
	}

	return s.repo.Delete(ctx, nftID)
}

// CountNFTs returns the total NFT count for a user.
func (s *NFTService) CountNFTs(ctx context.Context, uid string) (int64, error) {
	if uid == "" {
		return 0, fmt.Errorf("uid is required")
	}
	return s.repo.Count(ctx, uid)
}
