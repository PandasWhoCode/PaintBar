export class CanvasManager {
    constructor(paintBar, options = {}) {
        this.paintBar = paintBar;
        this.canvases = {
            transparentBg: paintBar.transparentBgCanvas,
            opaqueBg: paintBar.opaqueBgCanvas,
            drawing: paintBar.canvas,
            overlay: paintBar.overlayCanvas
        };

        // Initialize dimensions
        this.canvasWidth = options.width || 800;
        this.canvasHeight = options.height || 600;
        this.minWidth = options.minWidth || 300;
        this.minHeight = options.minHeight || 200;
        this.maxWidth = options.maxWidth || 4096;
        this.maxHeight = options.maxHeight || 4096;
        this.responsiveCanvas = options.responsive !== undefined ? options.responsive : true;

        // If square, ensure dimensions are equal
        if (this.paintBar.isSquare) {
            const size = Math.min(this.canvasWidth, this.canvasHeight);
            this.canvasWidth = size;
            this.canvasHeight = size;
            
            // Also ensure min/max dimensions are equal
            const minSize = Math.max(this.minWidth, this.minHeight);
            const maxSize = Math.min(this.maxWidth, this.maxHeight);
            this.minWidth = this.minHeight = minSize;
            this.maxWidth = this.maxHeight = maxSize;
        }

        // Initialize canvases with the correct dimensions
        this.initializeCanvases();
    }

    initializeCanvases() {
        // Set size for all canvas layers
        Object.values(this.canvases).forEach(canvas => {
            this.setCanvasSize(canvas);
        });
        
        // Update container class if square locked
        const container = this.canvases.drawing.parentElement;
        if (container) {
            if (this.paintBar.isSquare) {
                container.classList.add('square-locked');
            } else {
                container.classList.remove('square-locked');
            }
        }

        // Initialize specific canvas properties
        this.initializeTransparentBackground();
        this.initializeOpaqueBackground();
        this.initializeDrawingCanvas();
        this.initializeOverlayCanvas();

        if (this.responsiveCanvas) {
            this.setupResizeListener();
        }
    }

    setCanvasSize(canvas) {
        if (this.paintBar.isSquare) {
            // For square canvases, ensure width and height are equal
            const size = Math.min(this.canvasWidth, this.canvasHeight);
            canvas.width = size;
            canvas.height = size;
            canvas.style.width = size + 'px';
            canvas.style.height = size + 'px';
        } else {
            // For rectangular canvases
            canvas.width = this.canvasWidth;
            canvas.height = this.canvasHeight;
            canvas.style.width = this.canvasWidth + 'px';
            canvas.style.height = this.canvasHeight + 'px';
        }
    }

    initializeTransparentBackground() {
        const ctx = this.canvases.transparentBg.getContext('2d');
        this.paintBar.drawTransparentBackground();
    }

    initializeOpaqueBackground() {
        const ctx = this.canvases.opaqueBg.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    initializeDrawingCanvas() {
        const ctx = this.canvases.drawing.getContext('2d');
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    initializeOverlayCanvas() {
        const ctx = this.canvases.overlay.getContext('2d');
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.fillStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    setupResizeListener() {
        // Throttle resize events for better performance
        let resizeTimeout;
        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 100);
        });
    }

    handleResize() {
        if (!this.responsiveCanvas) return;

        const container = this.canvases.drawing.parentElement;
        if (!container) return;

        // Get container dimensions
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Calculate new dimensions
        let newWidth, newHeight;
        
        if (this.paintBar.isSquare) {
            // For square canvases, use the smaller container dimension
            const size = Math.min(containerWidth, containerHeight);
            newWidth = size;
            newHeight = size;
            container.classList.add('square-locked');
        } else {
            // For rectangular canvases, maintain aspect ratio
            newWidth = containerWidth;
            newHeight = (containerWidth * this.canvasHeight) / this.canvasWidth;
            container.classList.remove('square-locked');
        }

        // Ensure dimensions are within bounds
        newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));
        newHeight = Math.max(this.minHeight, Math.min(this.maxHeight, newHeight));
        
        // If square, ensure both dimensions are equal after bounds checking
        if (this.paintBar.isSquare) {
            const size = Math.min(newWidth, newHeight);
            newWidth = size;
            newHeight = size;
        }

        // Update canvas dimensions
        this.canvasWidth = newWidth;
        this.canvasHeight = newHeight;

        // Resize all canvases
        Object.values(this.canvases).forEach(canvas => {
            this.setCanvasSize(canvas);
        });

        // Redraw canvas contents
        this.redrawCanvases();
    }

    redrawCanvases() {
        // Save current drawing canvas state
        const drawingState = this.canvases.drawing.getContext('2d').getImageData(0, 0, this.canvasWidth, this.canvasHeight);
        
        // Reinitialize backgrounds
        this.initializeTransparentBackground();
        this.initializeOpaqueBackground();
        
        // Restore drawing canvas state
        this.canvases.drawing.getContext('2d').putImageData(drawingState, 0, 0);
        
        // Clear and resize overlay
        this.initializeOverlayCanvas();
    }

    updateCanvasSettings(settings) {
        const { style, width, height, responsive } = settings;
        this.canvasStyle = style || this.canvasStyle;
        this.canvasWidth = width || this.canvasWidth;
        this.canvasHeight = height || this.canvasHeight;
        this.responsiveCanvas = responsive !== undefined ? responsive : this.responsiveCanvas;

        this.initializeCanvases();
    }
}
