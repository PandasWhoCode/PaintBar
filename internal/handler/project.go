package handler

import (
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/service"
)

// ProjectHandler handles project API endpoints.
type ProjectHandler struct {
	projectService *service.ProjectService
}

// NewProjectHandler creates a new ProjectHandler.
func NewProjectHandler(projectService *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{projectService: projectService}
}

// ListProjects handles GET /api/projects
func (h *ProjectHandler) ListProjects(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	limit, startAfter := parsePagination(r)

	projects, err := h.projectService.ListProjects(r.Context(), user.UID, limit, startAfter)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, projects)
}

// GetProject handles GET /api/projects/{id}
func (h *ProjectHandler) GetProject(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	projectID := chi.URLParam(r, "id")

	project, err := h.projectService.GetProject(r.Context(), user.UID, projectID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, project)
}

// GetProjectByTitle handles GET /api/projects/by-title?title=...
func (h *ProjectHandler) GetProjectByTitle(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	title := r.URL.Query().Get("title")
	if title == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "title query parameter is required"})
		return
	}

	project, err := h.projectService.GetProjectByTitle(r.Context(), user.UID, title)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, project)
}

// CreateProject handles POST /api/projects
func (h *ProjectHandler) CreateProject(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	var project model.Project
	if !decodeJSON(w, r, &project) {
		return
	}

	result, err := h.projectService.CreateProject(r.Context(), user.UID, &project)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}

// ConfirmUpload handles POST /api/projects/{id}/confirm-upload
func (h *ProjectHandler) ConfirmUpload(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	projectID := chi.URLParam(r, "id")

	if err := h.projectService.ConfirmUpload(r.Context(), user.UID, projectID); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "confirmed"})
}

// UpdateProject handles PUT /api/projects/{id}
func (h *ProjectHandler) UpdateProject(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	projectID := chi.URLParam(r, "id")

	var update model.ProjectUpdate
	if !decodeJSON(w, r, &update) {
		return
	}

	if err := h.projectService.UpdateProject(r.Context(), user.UID, projectID, &update); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// DeleteProject handles DELETE /api/projects/{id}
func (h *ProjectHandler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	projectID := chi.URLParam(r, "id")

	if err := h.projectService.DeleteProject(r.Context(), user.UID, projectID); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// UploadBlob handles POST /api/projects/{id}/upload-blob — accepts a PNG body
// and writes it to Storage server-side, avoiding CORS issues with direct GCS uploads.
func (h *ProjectHandler) UploadBlob(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	projectID := chi.URLParam(r, "id")

	// Limit request body to 10 MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	if err := h.projectService.UploadBlob(r.Context(), user.UID, projectID, r.Body); err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "uploaded"})
}

// DownloadBlob handles GET /api/projects/{id}/blob — streams the project PNG
// from Storage through the API so the browser never hits the storage emulator
// directly (avoids CORS and auth issues).
func (h *ProjectHandler) DownloadBlob(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	projectID := chi.URLParam(r, "id")

	reader, err := h.projectService.DownloadBlob(r.Context(), user.UID, projectID)
	if err != nil {
		respondError(w, err)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	io.Copy(w, reader)
}

// CountProjects handles GET /api/projects/count
func (h *ProjectHandler) CountProjects(w http.ResponseWriter, r *http.Request) {
	user := requireUser(w, r)
	if user == nil {
		return
	}

	count, err := h.projectService.CountProjects(r.Context(), user.UID)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]int64{"count": count})
}
