package handler

import (
	"net/http"
)

// PageHandler serves SSR pages using Go templates.
type PageHandler struct {
	renderer *TemplateRenderer
	env      string
}

// NewPageHandler creates a new PageHandler.
func NewPageHandler(renderer *TemplateRenderer, env string) *PageHandler {
	return &PageHandler{renderer: renderer, env: env}
}

// Login serves the login page (GET /).
func (h *PageHandler) Login(w http.ResponseWriter, r *http.Request) {
	h.renderer.Render(w, "login", PageData{
		Title: "Login - PaintBar",
		Env:   h.env,
	})
}

// Profile serves the profile page (GET /profile).
func (h *PageHandler) Profile(w http.ResponseWriter, r *http.Request) {
	h.renderer.Render(w, "profile", PageData{
		Title: "User Profile - Paintbar",
		Env:   h.env,
	})
}

// Canvas serves the canvas page (GET /canvas).
func (h *PageHandler) Canvas(w http.ResponseWriter, r *http.Request) {
	h.renderer.Render(w, "canvas", PageData{
		Title: "PaintBar",
		Env:   h.env,
	})
}

// NotFound serves the 404 page.
func (h *PageHandler) NotFound(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)
	h.renderer.Render(w, "404", PageData{
		Title: "Page Not Found - PaintBar",
		Env:   h.env,
	})
}
