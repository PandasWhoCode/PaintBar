package handler

import (
	"net/http"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/service"
)

// ProfileHandler handles user profile API endpoints.
type ProfileHandler struct {
	userService *service.UserService
}

// NewProfileHandler creates a new ProfileHandler.
func NewProfileHandler(userService *service.UserService) *ProfileHandler {
	return &ProfileHandler{userService: userService}
}

// GetProfile handles GET /api/profile
func (h *ProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	profile, err := h.userService.GetProfile(r.Context(), user.UID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, profile)
}

// UpdateProfile handles PUT /api/profile
func (h *ProfileHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	var update model.UserUpdate
	if !decodeJSON(w, r, &update) {
		return
	}

	if err := h.userService.UpdateProfile(r.Context(), user.UID, user.UID, &update); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// ClaimUsername handles POST /api/claim-username
func (h *ProfileHandler) ClaimUsername(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	var body struct {
		Username string `json:"username"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	if err := h.userService.ClaimUsername(r.Context(), user.UID, body.Username); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "claimed", "username": body.Username})
}
