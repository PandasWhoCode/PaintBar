import { GenericTool } from './genericTool.js';

class ShapeTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.startPoint = null;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.startPoint = point;
        this.applyBrushSettings(this.getOverlayContext());
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.clearOverlay();
        this.drawPreview(point);
    }

    onMouseUp(point) {
        if (!this.isDrawing) return;
        
        // Draw final shape on main canvas
        this.applyBrushSettings(this.getContext());
        this.drawShape(this.getContext(), point);
        
        // Clear overlay
        this.clearOverlay();
        
        super.onMouseUp(point);
        this.saveState();
    }

    activate() {
        super.activate();
        this.paintBar.overlayCanvas.style.pointerEvents = 'auto';
    }

    deactivate() {
        this.paintBar.overlayCanvas.style.pointerEvents = 'none';
        this.clearOverlay();
    }

    drawPreview(point) {
        this.drawShape(this.getOverlayContext(), point);
    }

    drawShape(ctx, point) {
        // Override in specific shape tools
    }
}

export class RectangleTool extends ShapeTool {
    drawShape(ctx, point) {
        const width = point.x - this.startPoint.x;
        const height = point.y - this.startPoint.y;
        
        if (this.paintBar.fillShape) {
            ctx.globalAlpha = 0.5;
            ctx.fillRect(this.startPoint.x, this.startPoint.y, width, height);
            ctx.globalAlpha = 1;
        }
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
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1;
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
