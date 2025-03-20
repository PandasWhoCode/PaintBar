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
        
        // Draw stroke first to create solid boundary
        ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
        
        // Draw filled rectangle if fill is enabled
        if (this.paintBar.fillShape) {
            ctx.fillRect(this.startPoint.x, this.startPoint.y, width, height);
        }
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
        
        // Draw stroke first to create solid boundary
        ctx.stroke();
        
        if (this.paintBar.fillShape) {
            ctx.fill();
        }
    }
}

export class LineTool extends ShapeTool {
    drawShape(ctx, point) {
        // Save current line cap
        const oldLineCap = ctx.lineCap;
        
        // Use butt line cap for crisp lines
        ctx.lineCap = 'butt';
        
        ctx.beginPath();
        ctx.moveTo(this.startPoint.x, this.startPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        
        // Restore original line cap
        ctx.lineCap = oldLineCap;
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
        
        // Draw stroke first to create solid boundary
        ctx.stroke();
        
        if (this.paintBar.fillShape) {
            ctx.fill();
        }
    }

    calculateTrianglePoints(point) {
        const type = this.paintBar.triangleType || 'equilateral';
        const dx = point.x - this.startPoint.x;
        const dy = point.y - this.startPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        switch (type) {
            case 'right':
                return [
                    this.startPoint,
                    { x: point.x, y: this.startPoint.y },
                    point
                ];
            
            case 'isosceles':
                // Use the mouse distance for height and calculate base width
                const baseWidth = distance * 0.8; // 80% of height for nice proportions
                const baseAngle = angle + Math.PI/2; // Perpendicular to height
                
                // Calculate base points by rotating around apex (startPoint)
                return [
                    this.startPoint, // Apex
                    { // Left base point
                        x: point.x + baseWidth/2 * Math.cos(baseAngle),
                        y: point.y + baseWidth/2 * Math.sin(baseAngle)
                    },
                    { // Right base point
                        x: point.x - baseWidth/2 * Math.cos(baseAngle),
                        y: point.y - baseWidth/2 * Math.sin(baseAngle)
                    }
                ];
            
            case 'equilateral':
            default:
                // For a perfect equilateral triangle:
                // 1. Use mouse point to determine size and orientation
                // 2. Calculate other two points using 60° angles
                
                // The height of an equilateral triangle is: side * √3/2
                // And the base points are ±(side/2) from the center
                
                // Let the mouse distance determine the side length
                const side = distance;
                const height = side * Math.sqrt(3) / 2;
                
                // Calculate the direction vector and its perpendicular
                const dirX = dx / distance;
                const dirY = dy / distance;
                const perpX = -dirY;
                const perpY = dirX;
                
                // Calculate the base center point
                const baseCenterX = this.startPoint.x + dirX * height;
                const baseCenterY = this.startPoint.y + dirY * height;
                
                // Calculate the two base points
                const halfSide = side / 2;
                return [
                    this.startPoint,
                    {
                        x: baseCenterX + perpX * halfSide,
                        y: baseCenterY + perpY * halfSide
                    },
                    {
                        x: baseCenterX - perpX * halfSide,
                        y: baseCenterY - perpY * halfSide
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

export class ArcTool extends ShapeTool {
    constructor(paintBar) {
        super(paintBar);
        this.midPoint = null;
        this.endPoint = null;
        this.arcPhase = 'line'; // 'line' or 'arc'
    }

    onMouseDown(point) {
        if (this.arcPhase === 'line') {
            super.onMouseDown(point);
        } else if (this.arcPhase === 'arc' && this.startPoint && this.endPoint) {
            this.midPoint = point;
            this.isDrawing = true;
        }
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.clearOverlay();
        
        if (this.arcPhase === 'line') {
            // Draw straight line preview
            this.drawPreview(point);
        } else if (this.arcPhase === 'arc' && this.startPoint && this.endPoint) {
            // Draw arc preview with current point as control point
            this.midPoint = point;
            this.drawPreview(point);
        }
    }

    onMouseUp(point) {
        if (!this.isDrawing) return;

        if (this.arcPhase === 'line') {
            this.endPoint = point;
            this.arcPhase = 'arc';
            this.isDrawing = false;
        } else if (this.arcPhase === 'arc') {
            // Draw final arc
            const mainCtx = this.getContext();
            mainCtx.save();
            
            mainCtx.strokeStyle = this.paintBar.currentColor;
            mainCtx.fillStyle = this.paintBar.currentColor;
            mainCtx.lineWidth = this.paintBar.lineWidth;
            mainCtx.lineCap = 'round';
            mainCtx.lineJoin = 'round';
            
            this.drawShape(mainCtx, point);
            
            mainCtx.restore();
            this.clearOverlay();
            
            // Reset for next arc
            this.isDrawing = false;
            this.startPoint = null;
            this.endPoint = null;
            this.midPoint = null;
            this.arcPhase = 'line';
        }
    }

    drawShape(ctx, point) {
        if (this.arcPhase === 'line' && this.startPoint) {
            // Draw straight line preview
            ctx.beginPath();
            ctx.moveTo(this.startPoint.x, this.startPoint.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        } else if (this.arcPhase === 'arc' && this.startPoint && this.endPoint) {
            // Draw arc using quadratic curve with cursor position as direct control point
            const controlPoint = point;
            
            ctx.beginPath();
            ctx.moveTo(this.startPoint.x, this.startPoint.y);
            ctx.quadraticCurveTo(
                controlPoint.x, controlPoint.y, // Use cursor position directly as control point
                this.endPoint.x, this.endPoint.y
            );
            ctx.stroke();
        }
    }

    deactivate() {
        super.deactivate();
        this.arcPhase = 'line';
        this.endPoint = null;
        this.midPoint = null;
    }
}
