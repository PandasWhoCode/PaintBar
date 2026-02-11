# Frontend

[← Authentication](authentication.md) · [Docs Index](README.md) · [Deployment →](deployment.md)

## Overview

The frontend consists of:

- **Go `html/template` SSR** — Server-rendered HTML pages (login, profile, canvas, 404)
- **TypeScript** — Client-side logic bundled by esbuild
- **HTML5 Canvas** — Multi-layer drawing application
- **Firebase Auth SDK** — Client-side authentication

## Template System

### Base Layout

All pages extend `web/templates/layouts/base.html`, which defines three blocks:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{block "title" .}}PaintBar{{end}}</title>
    <link rel="icon" type="image/x-icon" href="/static/images/favicon.ico" />
    {{block "head" .}}{{end}}
    <!-- Page-specific CSS/meta -->
  </head>
  <body>
    {{block "body" .}}{{end}}
    <!-- Page content -->
    {{block "scripts" .}}{{end}}
    <!-- Page-specific JS -->
  </body>
</html>
```

### Page Templates

| Template             | Route         | Description                  |
| -------------------- | ------------- | ---------------------------- |
| `pages/login.html`   | `/`, `/login` | Firebase Auth sign-in        |
| `pages/profile.html` | `/profile`    | User profile with edit modal |
| `pages/canvas.html`  | `/canvas`     | PaintBar drawing app         |
| `pages/404.html`     | (catch-all)   | Not found page               |

### Template Functions

| Function      | Usage             | Description                          |
| ------------- | ----------------- | ------------------------------------ |
| `currentYear` | `{{currentYear}}` | Returns current year (for copyright) |

### PageData

Data passed to every template:

```go
type PageData struct {
    Title          string      // Page title
    Env            string      // Environment (local/preview/production)
    FirebaseConfig template.JS // Firebase config JSON (unused currently)
}
```

---

## TypeScript Architecture

### Entry Points

esbuild bundles three entry points:

| Entry                       | Output                               | Page         |
| --------------------------- | ------------------------------------ | ------------ |
| `web/ts/canvas/app.ts`      | `web/static/dist/canvas/app.js`      | Canvas app   |
| `web/ts/auth/login.ts`      | `web/static/dist/auth/login.js`      | Login page   |
| `web/ts/profile/profile.ts` | `web/static/dist/profile/profile.js` | Profile page |

### Build Pipeline

```text
web/ts/**/*.ts
      │
      ▼
   esbuild
   ├── --bundle          (resolve imports)
   ├── --splitting        (code splitting for shared chunks)
   ├── --format=esm       (ES modules)
   ├── --outdir=web/static/dist
   ├── --minify           (always)
   └── --sourcemap        (dev only)
      │
      ▼
web/static/dist/
   ├── canvas/app.js          (46 KB)
   ├── auth/login.js          (2 KB)
   ├── profile/profile.js     (13 KB)
   ├── chunk-GWDCYFSA.js      (433 KB — Firebase SDK shared chunk)
   ├── chunk-6V3UCYXW.js      (36 KB — shared utilities)
   └── index.esm-*.js         (22 KB — Firebase internals)
```

### Build Commands

```bash
task ts-build          # Dev build (with source maps)
task ts-build:prod     # Production build (no source maps)
task ts-check          # TypeScript type checking only (no emit)
```

### TypeScript Configuration

`web/ts/tsconfig.json`:

- **Target**: ES2022
- **Module**: ES2022 with bundler resolution
- **Strict mode**: enabled
- **noEmit**: true (esbuild handles emit, tsc is for type checking only)
- **Path aliases**: `@shared/*`, `@canvas/*`, `@auth/*`, `@profile/*`

---

## Canvas Application

### Class Diagram

```text
┌─────────────────────────────────────────────────────────┐
│                       PaintBar                           │
│                                                          │
│  Canvas Layers:                                          │
│    transparentBgCanvas / transparentBgCtx                │
│    opaqueBgCanvas / opaqueBgCtx                          │
│    canvas (drawing) / ctx                                │
│    overlayCanvas / overlayCtx                            │
│                                                          │
│  State:                                                  │
│    isDrawing, currentColor, lineWidth, fillShape         │
│    isTransparent, recentColors[], undoStack[], redoStack[]│
│                                                          │
│  Methods:                                                │
│    handleMouseDown/Move/Up(), handleTouch*()             │
│    undo(), redo(), clearCanvas(), pasteContent()         │
│    setActiveTool(), updateColor()                        │
│    toggleTransparency(), toggleToolbar()                 │
├──────────┬──────────────┬────────────────────────────────┤
│          │              │                                │
│          ▼              ▼                                ▼
│  ┌──────────────┐ ┌───────────┐              ┌──────────────┐
│  │ ToolManager  │ │SaveManager│              │CanvasManager │
│  │              │ │           │              │              │
│  │ activeTool   │ │ saveImage │              │ canvases{}   │
│  │ tools{}      │ │ showModal │              │ canvasWidth  │
│  │ setTool()    │ │ hideModal │              │ canvasHeight │
│  │ onToolChange │ │           │              │ responsive   │
│  └──────┬───────┘ └───────────┘              │ handleResize │
│         │                                    │ initCanvases │
│         ▼                                    └──────────────┘
│  ┌─────────────────────────────────┐
│  │          Tool Hierarchy          │
│  │                                  │
│  │  genericTool.ts (Tool interface) │
│  │    ├── basicTools.ts             │
│  │    │   ├── PencilTool            │
│  │    │   ├── EraserTool            │
│  │    │   ├── SprayTool             │
│  │    │   └── FillTool              │
│  │    ├── objectTools.ts            │
│  │    │   ├── RectangleTool         │
│  │    │   ├── CircleTool            │
│  │    │   ├── LineTool              │
│  │    │   ├── TriangleTool          │
│  │    │   ├── ArcTool               │
│  │    │   └── TextTool              │
│  │    └── actionTools.ts            │
│  │        └── SelectionTool         │
│  └─────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
```

### Canvas Layers

The drawing surface uses four stacked `<canvas>` elements:

```text
┌─────────────────────────────────────┐  ← selectionOverlay (top)
│  Selection rectangles, guides       │     overlayCtx
├─────────────────────────────────────┤
│  User's drawing                     │  ← drawingCanvas
│  (willReadFrequently: true)         │     ctx
├─────────────────────────────────────┤
│  Opaque white background            │  ← opaqueBackgroundCanvas
│  (hidden when transparent mode on)  │     opaqueBgCtx
├─────────────────────────────────────┤
│  Checkerboard pattern               │  ← transparentBackgroundCanvas (bottom)
│  (visible when transparent mode on) │     transparentBgCtx
└─────────────────────────────────────┘
```

All four canvases share the same dimensions and are positioned absolutely on top of each other via CSS.

### Canvas Initialization Flow

```text
DOMContentLoaded
  │
  ├── Hide settings modal
  ├── Auth gate (onAuthStateChanged)
  │   └── If not authenticated → redirect to /login
  │
  ├── Show settings modal (width, height, responsive, square lock)
  │
  └── "Start PaintBar" button click
      │
      ├── Read canvas options from form
      ├── Hide settings modal
      └── new PaintBar(options)
          │
          ├── Initialize canvas elements (getElementById)
          ├── Initialize dimensions + drawing state
          ├── Create ToolManager, SaveManager, CanvasManager
          ├── initializeState() — set canvas size, ctx defaults
          ├── initializeElements() — toolbar, color picker, buttons
          ├── initializeUI() — color picker (iro.js), toolbar state
          ├── initializeCanvas() — CanvasManager.initializeCanvases()
          └── setupEventListeners() — mouse, touch, keyboard, tools
```

### Responsive Resize

When responsive mode is enabled, `CanvasManager` listens for window resize events:

1. **Capture** current drawing state via `getImageData()` (before dimension reset)
2. **Reset** canvas `width`/`height` (clears bitmap)
3. **Restore** drawing state via `putImageData()`
4. **Recalculate** CSS display dimensions to fit container

### Tool Interface

All tools implement the `Tool` interface from `genericTool.ts`:

```typescript
interface Tool {
  onMouseDown(point: Point): void;
  onMouseMove(point: Point): void;
  onMouseUp(point: Point): void;
  cursor: string;
}
```

### Save/Export

`SaveManager` supports exporting in three formats:

| Format | Extension | Method                                                 |
| ------ | --------- | ------------------------------------------------------ |
| PNG    | `.png`    | `canvas.toDataURL('image/png')`                        |
| JPEG   | `.jpg`    | White background fill + `toDataURL('image/jpeg', 0.9)` |
| ICO    | `.ico`    | 64×64 center-cropped PNG (browser limitation)          |

Each format supports transparent and opaque variants.

### Undo/Redo

- **Undo stack**: Stores `ImageData` snapshots (max 20)
- **Redo stack**: Populated when undoing
- **Keyboard shortcuts**: `Cmd/Ctrl+Z` (undo), `Cmd/Ctrl+Shift+Z` (redo)

---

## Shared TypeScript Types

Defined in `web/ts/shared/types.ts`:

| Type            | Description                                             |
| --------------- | ------------------------------------------------------- |
| `Point`         | `{ x, y }` — 2D canvas coordinate                       |
| `CanvasOptions` | Width, height, responsive, min/max dimensions, isSquare |
| `User`          | Firestore user profile fields                           |
| `UserUpdate`    | Partial profile update payload                          |
| `TextState`     | Text tool state (font, size, color, rotation, style)    |
| `RGBA`          | `{ r, g, b, a }` color                                  |
| `ImageFormat`   | `'png' \| 'jpg' \| 'ico'`                               |
| `TriangleType`  | `'right' \| 'isosceles' \| 'equilateral'`               |
| `ToolName`      | Union of all tool names                                 |
| `CanvasLayers`  | Named canvas element references                         |
| `SelectionArea` | `{ x, y, width, height }`                               |

---

## Static Assets

Served by the Go file server at `/static/*` from `web/static/`:

```text
web/static/
├── dist/           # esbuild output (gitignored)
├── images/
│   ├── favicon.ico
│   ├── paintbar.logo.png
│   ├── panda.png
│   └── menus/      # Toolbar menu icons
│       ├── tools_pencil.png
│       ├── tools_eraser.png
│       ├── shapes_rectangle.png
│       └── ... (14 menu icons)
└── styles/
    ├── styles.css   # Canvas app styles
    ├── profile.css  # Profile page styles
    ├── login.css    # Login page styles
    └── error.css    # 404 page styles
```

Directory listing is disabled (`noDirListing` wrapper in `main.go`).

---

[← Authentication](authentication.md) · [Docs Index](README.md) · [Deployment →](deployment.md)
