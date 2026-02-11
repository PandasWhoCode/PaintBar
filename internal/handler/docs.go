package handler

import (
	"net/http"
)

// DocsHandler serves the OpenAPI spec and Swagger UI.
type DocsHandler struct {
	specData []byte
}

// NewDocsHandler creates a new DocsHandler with the raw spec bytes.
func NewDocsHandler(specData []byte) *DocsHandler {
	return &DocsHandler{specData: specData}
}

// ServeSpec serves the raw OpenAPI YAML spec at /api/docs/openapi.yaml.
func (h *DocsHandler) ServeSpec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml")
	w.Write(h.specData)
}

// ServeUI serves Swagger UI loaded from CDN, pointing at the local spec.
func (h *DocsHandler) ServeUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(swaggerHTML))
}

const swaggerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PaintBar API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.31.0/swagger-ui.css" integrity="sha384-KX9Rx9vM1AmUNAn07bPAiZhFD4C8jdNgG6f5MRNvR+EfAxs2PmMFtUUazui7ryZQ" crossorigin="anonymous">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.31.0/swagger-ui-bundle.js" integrity="sha384-cxafBeQ+zYROeFafGFxtFbnp1ICqeS9mG7+f0WWSHzhnrUvwg9Za5CCw6wgrHA7K" crossorigin="anonymous"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>`
