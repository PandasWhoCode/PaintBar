export class CanvasManager {
    constructor(paintBar, options = {}) {
        this.paintBar = paintBar;
        // Initialize canvas layers for different purposes:
        // - transparentBg: Displays the transparency grid pattern
        // - opaqueBg: Solid background color layer
        // - drawing: Main drawing canvas where all tools operate
        // - overlay: Temporary visual effects and tool previews
        this.canvases = {
            transparentBg: paintBar.transparentBgCanvas,
            opaqueBg: paintBar.opaqueBgCanvas,
            drawing: paintBar.canvas,
            overlay: paintBar.overlayCanvas
        };

        // Set canvas dimensions with configurable defaults
        this.canvasWidth = options.width || 800;
        this.canvasHeight = options.height || 600;
        this.minWidth = options.minWidth || 300;
        this.minHeight = options.minHeight || 200;
        this.maxWidth = options.maxWidth || 4096;
        this.maxHeight = options.maxHeight || 4096;
        this.responsiveCanvas = options.responsive !== undefined ? options.responsive : true;

        // Handle square canvas mode by ensuring equal dimensions
        if (this.paintBar.isSquare) {
            const size = Math.min(this.canvasWidth, this.canvasHeight);
            this.canvasWidth = size;
            this.canvasHeight = size;
            
            // Enforce equal min/max dimensions for square mode
            const minSize = Math.max(this.minWidth, this.minHeight);
            const maxSize = Math.min(this.maxWidth, this.maxHeight);
            this.minWidth = this.minHeight = minSize;
            this.maxWidth = this.maxHeight = maxSize;
        }

        // Set up all canvas layers and initialize their properties
        this.initializeCanvases();
    }

    initializeCanvases() {
        // Apply dimensions to all canvas layers
        Object.values(this.canvases).forEach(canvas => {
            this.setCanvasSize(canvas);
        });
        
        // Update container styling for square/rectangular modes
        const container = this.canvases.drawing.parentElement;
        if (container) {
            if (this.paintBar.isSquare) {
                container.classList.add('square-locked');
            } else {
                container.classList.remove('square-locked');
            }
        }

        // Initialize each canvas layer with its specific properties
        this.initializeTransparentBackground();
        this.initializeOpaqueBackground();
        this.initializeDrawingCanvas();
        this.initializeOverlayCanvas();

        // Set up responsive resizing if enabled
        if (this.responsiveCanvas) {
            this.setupResizeListener();
        }
    }

    setCanvasSize(canvas) {
        // Set actual canvas dimensions (not display size)
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        
        const wrapper = canvas.parentElement;
        if (!wrapper) return;

        const container = wrapper.parentElement;
        // Account for padding/margins in container
        const availableWidth = container.clientWidth - 40;
        const availableHeight = container.clientHeight - 40;
        
        if (this.paintBar.isSquare) {
            // For square mode, maintain 1:1 aspect ratio
            const size = Math.min(availableWidth, availableHeight);
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
        } else {
            // For rectangular mode, use responsive sizing while maintaining aspect ratio
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            
            // Calculate and set wrapper size to maintain aspect ratio
            const canvasAspectRatio = this.canvasWidth / this.canvasHeight;
            const containerAspectRatio = availableWidth / availableHeight;
            
            if (containerAspectRatio > canvasAspectRatio) {
                // Container is wider than needed, fit to height
                const width = availableHeight * canvasAspectRatio;
                wrapper.style.width = `${width}px`;
                wrapper.style.height = `${availableHeight}px`;
            } else {
                // Container is taller than needed, fit to width
                const height = availableWidth / canvasAspectRatio;
                wrapper.style.width = `${availableWidth}px`;
                wrapper.style.height = `${height}px`;
            }
        }
    }

    initializeTransparentBackground() {
        // Initialize transparent background canvas with grid pattern
        const ctx = this.canvases.transparentBg.getContext('2d');
        this.paintBar.drawTransparentBackground();
    }

    initializeOpaqueBackground() {
        // Initialize opaque background canvas with solid color
        const ctx = this.canvases.opaqueBg.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    initializeDrawingCanvas() {
        // Initialize main drawing canvas with default tool settings
        const ctx = this.canvases.drawing.getContext('2d');
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    initializeOverlayCanvas() {
        // Initialize overlay canvas for temporary visual effects and tool previews
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
        // Update canvas settings with new values
        const { style, width, height, responsive } = settings;
        this.canvasStyle = style || this.canvasStyle;
        this.canvasWidth = width || this.canvasWidth;
        this.canvasHeight = height || this.canvasHeight;
        this.responsiveCanvas = responsive !== undefined ? responsive : this.responsiveCanvas;

        // Reinitialize canvases with new settings
        this.initializeCanvases();
    }
}
