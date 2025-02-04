export class GenericTool {
    constructor(paintBar) {
        this.paintBar = paintBar;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    // Mouse event handlers
    onMouseDown(point) {
        this.isDrawing = true;
        this.lastX = point.x;
        this.lastY = point.y;
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
        ctx.save();
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.fillStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        return ctx;
    }

    restoreContext(ctx) {
        ctx.restore();
    }

    getPointsBetween(x1, y1, x2, y2) {
        const points = [];
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            points.push({ x: x1, y: y1 });
            if (x1 === x2 && y1 === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x1 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y1 += sy;
            }
        }

        return points;
    }
}
