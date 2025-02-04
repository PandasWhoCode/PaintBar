export class GenericTool {
    constructor(paintBar) {
        this.paintBar = paintBar;
        this.isDrawing = false;
    }

    // Mouse event handlers
    onMouseDown(point) {
        this.isDrawing = true;
    }

    onMouseMove(point) {
        // Override in specific tools
    }

    onMouseUp(point) {
        this.isDrawing = false;
    }

    // Tool lifecycle methods
    activate() {
        this.paintBar.canvas.style.cursor = 'crosshair';
    }

    deactivate() {
        // Clean up any tool-specific state
    }

    // Helper methods
    saveState() {
        this.paintBar.saveState();
    }

    getContext() {
        return this.paintBar.ctx;
    }

    getOverlayContext() {
        return this.paintBar.overlayCtx;
    }

    clearOverlay() {
        const ctx = this.getOverlayContext();
        ctx.clearRect(0, 0, this.paintBar.overlayCanvas.width, this.paintBar.overlayCanvas.height);
    }

    applyBrushSettings(ctx) {
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.fillStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
}
