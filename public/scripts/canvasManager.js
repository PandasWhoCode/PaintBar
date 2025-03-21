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
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        
        // Initial display size
        if (this.paintBar.isSquare) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        } else {
            // For rectangular, maintain aspect ratio
            const wrapper = canvas.parentElement;
            if (wrapper) {
                const container = wrapper.parentElement;
                const availableWidth = container.clientWidth - 40;
                const availableHeight = container.clientHeight - 40;
                
                const canvasAspectRatio = this.canvasWidth / this.canvasHeight;
                const containerAspectRatio = availableWidth / availableHeight;
                
                if (containerAspectRatio > canvasAspectRatio) {
                    canvas.style.height = `${availableHeight}px`;
                    canvas.style.width = `${availableHeight * canvasAspectRatio}px`;
                } else {
                    canvas.style.width = `${availableWidth}px`;
                    canvas.style.height = `${availableWidth / canvasAspectRatio}px`;
                }
            }
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

        const wrapper = this.canvases.drawing.parentElement;
        if (!wrapper) return;

        const container = wrapper.parentElement;
        const availableWidth = container.clientWidth - 40;
        const availableHeight = container.clientHeight - 40;

        if (this.paintBar.isSquare) {
            wrapper.classList.add('square-locked');
            // Square canvas sizing is handled by CSS
        } else {
            wrapper.classList.remove('square-locked');
            
            // Calculate dimensions that maintain aspect ratio
            const canvasAspectRatio = this.canvasWidth / this.canvasHeight;
            const containerAspectRatio = availableWidth / availableHeight;
            
            let displayWidth, displayHeight;
            
            if (containerAspectRatio > canvasAspectRatio) {
                // Container is wider than needed, fit to height
                displayHeight = availableHeight;
                displayWidth = displayHeight * canvasAspectRatio;
            } else {
                // Container is taller than needed, fit to width
                displayWidth = availableWidth;
                displayHeight = displayWidth / canvasAspectRatio;
            }

            // Update canvas display sizes
            Object.values(this.canvases).forEach(canvas => {
                canvas.style.width = `${displayWidth}px`;
                canvas.style.height = `${displayHeight}px`;
            });
        }

        // Update all canvases with their actual dimensions
        Object.values(this.canvases).forEach(canvas => {
            canvas.width = this.canvasWidth;
            canvas.height = this.canvasHeight;
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
