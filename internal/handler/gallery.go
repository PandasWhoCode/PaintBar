package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/service"
)

// GalleryHandler handles gallery API endpoints.
type GalleryHandler struct {
	galleryService *service.GalleryService
}

// NewGalleryHandler creates a new GalleryHandler.
func NewGalleryHandler(galleryService *service.GalleryService) *GalleryHandler {
	return &GalleryHandler{galleryService: galleryService}
}

// ListItems handles GET /api/gallery
func (h *GalleryHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	limit, startAfter := parsePagination(r)

	items, err := h.galleryService.ListItems(r.Context(), user.UID, limit, startAfter)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, items)
}

// GetItem handles GET /api/gallery/{id}
func (h *GalleryHandler) GetItem(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	itemID := chi.URLParam(r, "id")

	item, err := h.galleryService.GetItem(r.Context(), user.UID, itemID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, item)
}

// ShareToGallery handles POST /api/gallery
func (h *GalleryHandler) ShareToGallery(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	var item model.GalleryItem
	if !decodeJSON(w, r, &item) {
		return
	}

	id, err := h.galleryService.ShareToGallery(r.Context(), user.UID, &item)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DeleteItem handles DELETE /api/gallery/{id}
func (h *GalleryHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	itemID := chi.URLParam(r, "id")

	if err := h.galleryService.DeleteItem(r.Context(), user.UID, itemID); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// CountItems handles GET /api/gallery/count
func (h *GalleryHandler) CountItems(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	count, err := h.galleryService.CountItems(r.Context(), user.UID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]int64{"count": count})
}
