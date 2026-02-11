package handler

import (
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

	id, err := h.projectService.CreateProject(r.Context(), user.UID, &project)
	if err != nil {
		respondError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"id": id})
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
