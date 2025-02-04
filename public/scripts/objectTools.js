import { GenericTool } from './genericTool.js';

class ShapeTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.startPoint = null;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.startPoint = point;
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.clearOverlay();
        this.drawPreview(point);
    }

    onMouseUp(point) {
        if (!this.isDrawing || !this.startPoint) return;
        
        // Draw final shape on main canvas
        const mainCtx = this.getContext();
        mainCtx.save();
        
        // Apply brush settings to main canvas
        mainCtx.strokeStyle = this.paintBar.currentColor;
        mainCtx.fillStyle = this.paintBar.currentColor;
        mainCtx.lineWidth = this.paintBar.lineWidth;
        mainCtx.lineCap = 'round';
        mainCtx.lineJoin = 'round';
        
        // Draw the shape
        this.drawShape(mainCtx, point);
        
        // Restore main canvas context
        mainCtx.restore();
        
        // Clear overlay
        this.clearOverlay();
        
        // Save state after drawing final shape
        this.paintBar.saveState();
        
        // Reset drawing state
        this.isDrawing = false;
        this.startPoint = null;
    }

    activate() {
        super.activate();
        this.paintBar.overlayCanvas.style.pointerEvents = 'auto';
    }

    deactivate() {
        this.paintBar.overlayCanvas.style.pointerEvents = 'none';
        this.clearOverlay();
        this.isDrawing = false;
        this.startPoint = null;
    }

    drawPreview(point) {
        const overlayCtx = this.getOverlayContext();
        overlayCtx.save();
        
        // Apply brush settings to overlay
        overlayCtx.strokeStyle = this.paintBar.currentColor;
        overlayCtx.fillStyle = this.paintBar.currentColor;
        overlayCtx.lineWidth = this.paintBar.lineWidth;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';
        
        // Draw preview
        this.drawShape(overlayCtx, point);
        
        // Restore overlay context
        overlayCtx.restore();
    }

    drawShape(ctx, point) {
        // Override in specific shape tools
    }
}

export class RectangleTool extends ShapeTool {
    drawShape(ctx, point) {
        // Calculate rectangle dimensions
        const width = point.x - this.startPoint.x;
        const height = point.y - this.startPoint.y;
        
        // Draw filled rectangle if fill is enabled
        if (this.paintBar.fillShape) {
            if (ctx === this.getOverlayContext()) {
                ctx.globalAlpha = 0.5;
            }
            ctx.fillRect(this.startPoint.x, this.startPoint.y, width, height);
            if (ctx === this.getOverlayContext()) {
                ctx.globalAlpha = 1.0;
            }
        }
        
        // Draw stroke
        ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
    }
}

export class CircleTool extends ShapeTool {
    drawShape(ctx, point) {
        const radius = Math.sqrt(
            Math.pow(point.x - this.startPoint.x, 2) +
            Math.pow(point.y - this.startPoint.y, 2)
        );
        
        ctx.beginPath();
        ctx.arc(this.startPoint.x, this.startPoint.y, radius, 0, Math.PI * 2);
        
        if (this.paintBar.fillShape) {
            if (ctx === this.getOverlayContext()) {
                ctx.globalAlpha = 0.5;
            }
            ctx.fill();
            if (ctx === this.getOverlayContext()) {
                ctx.globalAlpha = 1.0;
            }
        }
        ctx.stroke();
    }
}

export class LineTool extends ShapeTool {
    drawShape(ctx, point) {
        ctx.beginPath();
        ctx.moveTo(this.startPoint.x, this.startPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }
}

export class TriangleTool extends ShapeTool {
    drawShape(ctx, point) {
        const points = this.calculateTrianglePoints(point);
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.lineTo(points[2].x, points[2].y);
        ctx.closePath();
        
        if (this.paintBar.fillShape) {
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.stroke();
    }

    calculateTrianglePoints(point) {
        const type = this.paintBar.triangleType || 'equilateral';
        const dx = point.x - this.startPoint.x;
        const dy = point.y - this.startPoint.y;
        
        switch (type) {
            case 'right':
                return [
                    this.startPoint,
                    { x: point.x, y: this.startPoint.y },
                    point
                ];
            
            case 'isosceles':
                return [
                    { x: this.startPoint.x - dx, y: point.y },
                    { x: this.startPoint.x + dx, y: point.y },
                    this.startPoint
                ];
            
            case 'equilateral':
            default:
                const side = Math.sqrt(dx * dx + dy * dy);
                const height = side * Math.sqrt(3) / 2;
                const angle = Math.atan2(dy, dx);
                return [
                    this.startPoint,
                    {
                        x: this.startPoint.x + side * Math.cos(angle),
                        y: this.startPoint.y + side * Math.sin(angle)
                    },
                    {
                        x: this.startPoint.x + side * Math.cos(angle - Math.PI / 3),
                        y: this.startPoint.y + side * Math.sin(angle - Math.PI / 3)
                    }
                ];
        }
    }

    activate() {
        super.activate();
        const triangleTypeSelect = document.getElementById('triangle-type');
        if (triangleTypeSelect) {
            triangleTypeSelect.classList.remove('hidden');
        }
    }

    deactivate() {
        super.deactivate();
        const triangleTypeSelect = document.getElementById('triangle-type');
        if (triangleTypeSelect) {
            triangleTypeSelect.classList.add('hidden');
        }
    }
}
