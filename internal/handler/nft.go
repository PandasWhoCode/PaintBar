package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/service"
)

// NFTHandler handles NFT API endpoints.
type NFTHandler struct {
	nftService *service.NFTService
}

// NewNFTHandler creates a new NFTHandler.
func NewNFTHandler(nftService *service.NFTService) *NFTHandler {
	return &NFTHandler{nftService: nftService}
}

// ListNFTs handles GET /api/nfts
func (h *NFTHandler) ListNFTs(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	limit, startAfter := parsePagination(r)

	nfts, err := h.nftService.ListNFTs(r.Context(), user.UID, limit, startAfter)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, nfts)
}

// GetNFT handles GET /api/nfts/{id}
func (h *NFTHandler) GetNFT(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	nftID := chi.URLParam(r, "id")

	nft, err := h.nftService.GetNFT(r.Context(), user.UID, nftID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, nft)
}

// CreateNFT handles POST /api/nfts
func (h *NFTHandler) CreateNFT(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	var nft model.NFT
	if !decodeJSON(w, r, &nft) {
		return
	}

	id, err := h.nftService.CreateNFT(r.Context(), user.UID, &nft)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DeleteNFT handles DELETE /api/nfts/{id}
func (h *NFTHandler) DeleteNFT(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	nftID := chi.URLParam(r, "id")

	if err := h.nftService.DeleteNFT(r.Context(), user.UID, nftID); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// CountNFTs handles GET /api/nfts/count
func (h *NFTHandler) CountNFTs(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	count, err := h.nftService.CountNFTs(r.Context(), user.UID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]int64{"count": count})
}
