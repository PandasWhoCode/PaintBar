import { GenericTool } from './genericTool.js';

export class PencilTool extends GenericTool {
    onMouseDown(point) {
        super.onMouseDown(point);
        const ctx = this.getContext();
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        this.applyBrushSettings(ctx);
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        const ctx = this.getContext();
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }

    onMouseUp(point) {
        super.onMouseUp(point);
        this.saveState();
    }
}

export class EraserTool extends GenericTool {
    onMouseDown(point) {
        super.onMouseDown(point);
        this.erase(point);
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.erase(point);
    }

    onMouseUp(point) {
        super.onMouseUp(point);
        this.saveState();
    }

    erase(point) {
        const ctx = this.getContext();
        const eraseWidth = this.paintBar.lineWidth * 2;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(point.x, point.y, eraseWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export class FillTool extends GenericTool {
    onMouseDown(point) {
        super.onMouseDown(point);
        this.floodFill(point);
        this.saveState();
    }

    floodFill(point) {
        const ctx = this.getContext();
        const imageData = ctx.getImageData(0, 0, this.paintBar.canvas.width, this.paintBar.canvas.height);
        const pixels = imageData.data;
        
        const startPos = (point.y * this.paintBar.canvas.width + point.x) * 4;
        let startR = pixels[startPos];
        let startG = pixels[startPos + 1];
        let startB = pixels[startPos + 2];
        let startA = pixels[startPos + 3];
        
        if (startA === 0) {
            // If starting on a transparent pixel, treat it as white
            startR = 255;
            startG = 255;
            startB = 255;
            startA = 255;
        }
        
        const fillRGBA = this.hexToRGBA(this.paintBar.currentColor);
        
        if (this.colorsMatch(
            [startR, startG, startB, startA],
            [fillRGBA.r, fillRGBA.g, fillRGBA.b, fillRGBA.a * 255]
        )) {
            return; // Already filled
        }
        
        const stack = [[point.x, point.y]];
        const width = this.paintBar.canvas.width;
        const height = this.paintBar.canvas.height;
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const pos = (y * width + x) * 4;
            
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (!this.colorsMatch(
                [pixels[pos], pixels[pos + 1], pixels[pos + 2], pixels[pos + 3]],
                [startR, startG, startB, startA]
            )) continue;
            
            pixels[pos] = fillRGBA.r;
            pixels[pos + 1] = fillRGBA.g;
            pixels[pos + 2] = fillRGBA.b;
            pixels[pos + 3] = fillRGBA.a * 255;
            
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    colorsMatch(color1, color2, tolerance = 1) {
        return Math.abs(color1[0] - color2[0]) <= tolerance &&
               Math.abs(color1[1] - color2[1]) <= tolerance &&
               Math.abs(color1[2] - color2[2]) <= tolerance &&
               Math.abs(color1[3] - color2[3]) <= tolerance;
    }

    hexToRGBA(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: 1
        } : null;
    }
}

export class TextTool extends GenericTool {
    onMouseDown(point) {
        super.onMouseDown(point);
        this.paintBar.handleTextTool({
            clientX: point.x,
            clientY: point.y
        });
    }

    activate() {
        this.paintBar.canvas.style.cursor = 'text';
    }

    deactivate() {
        this.paintBar.cancelText();
    }
}

export class SelectionTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.isSelecting = false;
        this.isMovingSelection = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectedArea = null;
        this.selectionImageData = null;
        this.selectionBackgroundState = null;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        if (this.selectedArea && this.isPointInSelection(point)) {
            this.isMovingSelection = true;
            this.selectionMoveStart = point;
        } else {
            this.isSelecting = true;
            this.selectionStart = point;
            this.selectionEnd = point;
            this.clearSelection();
        }
    }

    onMouseMove(point) {
        if (this.isMovingSelection) {
            const dx = point.x - this.paintBar.lastX;
            const dy = point.y - this.paintBar.lastY;
            this.moveSelection(dx, dy);
        } else if (this.isSelecting) {
            this.selectionEnd = point;
            this.clearOverlay();
            this.drawSelectionBox();
        }
    }

    onMouseUp(point) {
        super.onMouseUp(point);
        if (this.isSelecting) {
            this.isSelecting = false;
            this.captureSelection();
        } else if (this.isMovingSelection) {
            this.isMovingSelection = false;
            this.finalizeSelection();
        }
    }

    activate() {
        this.paintBar.overlayCanvas.classList.add('active');
        this.paintBar.overlayCanvas.style.pointerEvents = 'auto';
        super.activate();
    }

    deactivate() {
        this.clearSelection();
        this.paintBar.overlayCanvas.classList.remove('active');
        this.paintBar.overlayCanvas.style.pointerEvents = 'none';
    }

    isPointInSelection(point) {
        if (!this.selectedArea) return false;
        
        return point.x >= this.selectedArea.x &&
               point.x <= this.selectedArea.x + this.selectedArea.width &&
               point.y >= this.selectedArea.y &&
               point.y <= this.selectedArea.y + this.selectedArea.height;
    }

    captureSelection() {
        const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
        const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
        
        if (width === 0 || height === 0) {
            this.clearSelection();
            return;
        }
        
        const ctx = this.getContext();
        this.selectedArea = { x, y, width, height };
        this.selectionImageData = ctx.getImageData(x, y, width, height);
        this.selectionBackgroundState = ctx.getImageData(x, y, width, height);
        
        // Clear the selected area on the main canvas
        ctx.clearRect(x, y, width, height);
        
        // Draw the selection on the overlay
        const overlayCtx = this.getOverlayContext();
        overlayCtx.putImageData(this.selectionImageData, x, y);
    }

    moveSelection(dx, dy) {
        if (!this.selectedArea || !this.selectionImageData) return;
        
        const newX = this.selectedArea.x + dx;
        const newY = this.selectedArea.y + dy;
        
        // Clear previous position
        const overlayCtx = this.getOverlayContext();
        overlayCtx.clearRect(
            this.selectedArea.x - 1,
            this.selectedArea.y - 1,
            this.selectedArea.width + 2,
            this.selectedArea.height + 2
        );
        
        // Draw at new position
        overlayCtx.putImageData(
            this.selectionImageData,
            newX,
            newY
        );
        
        // Update selection area
        this.selectedArea.x = newX;
        this.selectedArea.y = newY;
    }

    finalizeSelection() {
        if (!this.selectedArea || !this.selectionImageData) return;
        
        // Draw the selection onto the main canvas at its current position
        const ctx = this.getContext();
        ctx.putImageData(
            this.selectionImageData,
            this.selectedArea.x,
            this.selectedArea.y
        );
        
        // Clear the selection
        this.clearSelection();
        this.saveState();
    }

    clearSelection() {
        if (this.selectedArea && this.selectionBackgroundState) {
            // Restore the background state
            const ctx = this.getContext();
            ctx.putImageData(
                this.selectionBackgroundState,
                this.selectedArea.x,
                this.selectedArea.y
            );
        }
        
        // Clear the overlay
        this.clearOverlay();
        
        // Reset selection state
        this.selectedArea = null;
        this.selectionImageData = null;
        this.selectionBackgroundState = null;
        this.isSelecting = false;
        this.isMovingSelection = false;
    }

    drawSelectionBox() {
        if (!this.isSelecting) return;
        
        const ctx = this.getOverlayContext();
        const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
        const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
        
        ctx.strokeStyle = '#000';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, width, height);
        ctx.setLineDash([]);
    }
}
