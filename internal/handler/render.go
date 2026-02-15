package handler

import (
	"fmt"
	"html/template"
	"io/fs"
	"log/slog"
	"net/http"
	"time"
)

// TemplateRenderer manages Go html/template rendering.
type TemplateRenderer struct {
	templates map[string]*template.Template
}

// templateFuncs provides shared template functions.
var templateFuncs = template.FuncMap{
	"currentYear": func() int { return time.Now().Year() },
}

// NewTemplateRenderer parses templates from the given filesystem.
// Each page template is parsed together with the base layout.
func NewTemplateRenderer(templatesFS fs.FS) (*TemplateRenderer, error) {
	renderer := &TemplateRenderer{
		templates: make(map[string]*template.Template),
	}

	// Pages to register: name -> template file
	pages := map[string]string{
		"login":    "templates/pages/login.html",
		"profile":  "templates/pages/profile.html",
		"projects": "templates/pages/projects.html",
		"canvas":   "templates/pages/canvas.html",
		"404":      "templates/pages/404.html",
	}

	for name, page := range pages {
		tmpl, err := template.New("base.html").Funcs(templateFuncs).ParseFS(
			templatesFS,
			"templates/layouts/base.html",
			page,
		)
		if err != nil {
			return nil, fmt.Errorf("parse template %s: %w", name, err)
		}
		renderer.templates[name] = tmpl
	}

	return renderer, nil
}

// PageData holds data passed to page templates.
type PageData struct {
	Title          string
	Env            string
	FirebaseConfig template.JS
}

// Render renders a named template with the given data.
func (r *TemplateRenderer) Render(w http.ResponseWriter, name string, data PageData) {
	tmpl, ok := r.templates[name]
	if !ok {
		slog.Error("template not found", "name", name)
		http.Error(w, "page not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := tmpl.ExecuteTemplate(w, "base.html", data); err != nil {
		slog.Error("template render error", "name", name, "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}
