export class CanvasManager {
    constructor(paintBar) {
        this.paintBar = paintBar;
        this.canvasStyle = 'rectangle';
        this.canvasWidth = 800;
        this.canvasHeight = 600;
        this.responsiveCanvas = true;
        
        // Store references to all canvases
        this.canvases = {
            transparentBg: paintBar.transparentBgCanvas,
            opaqueBg: paintBar.opaqueBgCanvas,
            drawing: paintBar.canvas,
            overlay: paintBar.overlayCanvas
        };
    }

    initializeCanvases() {
        // Set size for all canvas layers
        Object.values(this.canvases).forEach(canvas => {
            this.setCanvasSize(canvas);
        });

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
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    handleResize() {
        if (!this.responsiveCanvas) return;

        const container = document.querySelector('.canvas-container');
        if (!container) return;

        // Calculate new dimensions based on container size
        // while maintaining aspect ratio
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const aspectRatio = this.canvasWidth / this.canvasHeight;

        let newWidth, newHeight;
        if (containerWidth / containerHeight > aspectRatio) {
            newHeight = containerHeight;
            newWidth = containerHeight * aspectRatio;
        } else {
            newWidth = containerWidth;
            newHeight = containerWidth / aspectRatio;
        }

        // Update canvas CSS dimensions
        Object.values(this.canvases).forEach(canvas => {
            canvas.style.width = `${newWidth}px`;
            canvas.style.height = `${newHeight}px`;
        });
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
