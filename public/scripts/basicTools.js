import { GenericTool } from './genericTool.js';

export class PencilTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.lastX = 0;
        this.lastY = 0;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.lastX = point.x;
        this.lastY = point.y;
        this.draw(point);
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.draw(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseUp(point) {
        if (!this.isDrawing) return;
        this.draw(point);
        this.paintBar.saveState();
        super.onMouseUp(point);
    }

    draw(point) {
        const ctx = this.getContext();
        this.applyBrushSettings(ctx);
        
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }
}

export class EraserTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.lastX = 0;
        this.lastY = 0;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.lastX = point.x;
        this.lastY = point.y;
        this.erase(point);
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.erase(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseUp(point) {
        if (!this.isDrawing) return;
        this.erase(point);
        this.paintBar.saveState();
        super.onMouseUp(point);
    }

    erase(point) {
        const ctx = this.getContext();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = '#000';  // Color doesn't matter due to composite operation
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }
}

export class FillTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        console.log('FillTool constructed');
    }

    onMouseDown(point) {
        console.log('FillTool onMouseDown', point);
        // Don't call super.onMouseDown to avoid setting isDrawing
        this.fill(point);
    }

    onMouseMove(point) {
        // Fill tool doesn't need mouse move handling
    }

    onMouseUp(point) {
        // Don't call super.onMouseUp since we're not using isDrawing
    }

    fill(point) {
        console.log('FillTool fill starting', point);
        const ctx = this.getContext();
        console.log('Got context:', ctx);
        
        const imageData = ctx.getImageData(0, 0, this.paintBar.canvas.width, this.paintBar.canvas.height);
        console.log('Got imageData:', {
            width: imageData.width,
            height: imageData.height,
            dataLength: imageData.data.length
        });
        
        const pixels = imageData.data;
        
        // Convert floating point coordinates to integers
        const x = Math.round(point.x);
        const y = Math.round(point.y);
        console.log('Rounded coordinates:', {x, y});
        
        // Ensure point is within bounds
        if (x < 0 || x >= imageData.width || 
            y < 0 || y >= imageData.height) {
            console.log('Point out of bounds:', {x, y});
            return;
        }
        
        // Calculate pixel position
        const startPos = (y * imageData.width + x) * 4;
        console.log('Start position:', startPos);
        
        // Debug pixel data
        console.log('Pixel data at position:', {
            pos: startPos,
            r: pixels[startPos],
            g: pixels[startPos + 1],
            b: pixels[startPos + 2],
            a: pixels[startPos + 3]
        });
        
        const startColor = {
            r: pixels[startPos],
            g: pixels[startPos + 1],
            b: pixels[startPos + 2],
            a: pixels[startPos + 3]
        };
        console.log('Start color:', startColor);
        
        const fillColor = this.hexToRGBA(this.paintBar.currentColor);
        console.log('Fill color:', fillColor);
        if (!fillColor) {
            console.log('Invalid fill color');
            return;
        }

        // If starting on a transparent pixel, we'll fill all connected transparent pixels
        const isStartTransparent = startColor.a === 0;
        console.log('Starting on transparent pixel:', isStartTransparent);
        
        // Start with the integer coordinates
        const stack = [[x, y]];
        const width = imageData.width;
        const height = imageData.height;
        console.log('Canvas dimensions:', {width, height});
        
        const visited = new Set();
        let pixelsFilled = 0;
        
        while (stack.length > 0) {
            const [px, py] = stack.pop();
            
            // Skip if outside canvas bounds
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            
            const key = `${px},${py}`;
            if (visited.has(key)) continue;
            
            const pos = (py * width + px) * 4;
            const currentAlpha = pixels[pos + 3];
            
            // If we started on a transparent pixel, only fill transparent pixels
            // If we started on an opaque pixel, match all color components
            if (isStartTransparent) {
                if (currentAlpha !== 0) continue;
            } else {
                if (!this.colorsMatch(
                    [pixels[pos], pixels[pos + 1], pixels[pos + 2], pixels[pos + 3]],
                    [startColor.r, startColor.g, startColor.b, startColor.a]
                )) continue;
            }
            
            visited.add(key);
            pixelsFilled++;
            
            // Fill the pixel
            pixels[pos] = fillColor.r;
            pixels[pos + 1] = fillColor.g;
            pixels[pos + 2] = fillColor.b;
            pixels[pos + 3] = fillColor.a * 255;
            
            // Add unvisited neighbors to stack
            const neighbors = [
                [px + 1, py],
                [px - 1, py],
                [px, py + 1],
                [px, py - 1]
            ];
            
            for (const [nx, ny] of neighbors) {
                const neighborKey = `${nx},${ny}`;
                if (!visited.has(neighborKey)) {
                    stack.push([nx, ny]);
                }
            }
        }
        
        console.log(`Filled ${pixelsFilled} pixels`);
        ctx.putImageData(imageData, 0, 0);
        this.paintBar.saveState();
        console.log('Fill operation complete');
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
    constructor(paintBar) {
        super(paintBar);
        this.textState = {
            text: '',
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#000000',
            x: 0,
            y: 0,
            isPreview: false
        };
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.initializeTextTool(point.x, point.y);
    }

    activate() {
        this.paintBar.canvas.style.cursor = 'text';
    }

    deactivate() {
        this.hideTextControls();
        this.resetTextState();
    }

    initializeTextTool(x, y) {
        this.textState.x = x;
        this.textState.y = y;
        
        const textModal = document.getElementById('textModal');
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontSelect');
        const fontSizeInput = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        
        if (textModal && textInput && fontSelect && fontSizeInput && textColor) {
            textModal.classList.remove('hidden');
            textInput.value = '';
            fontSelect.value = this.textState.fontFamily;
            fontSizeInput.value = this.textState.fontSize;
            textColor.value = this.paintBar.currentColor;
            textInput.focus();

            // Set up preview button
            const previewBtn = document.getElementById('previewTextBtn');
            if (previewBtn) {
                previewBtn.onclick = () => this.previewText();
            }
        }
    }

    previewText() {
        const textModal = document.getElementById('textModal');
        const previewOverlay = document.getElementById('textPreviewOverlay');
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontSelect');
        const fontSizeInput = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        
        if (textModal && previewOverlay && textInput && fontSelect && fontSizeInput && textColor) {
            const text = textInput.value.trim();
            if (text === '') return;

            // Store text properties
            this.textState = {
                text: text,
                fontFamily: fontSelect.value,
                fontSize: parseInt(fontSizeInput.value),
                color: textColor.value,
                x: this.textState.x,
                y: this.textState.y,
                isPreview: true
            };

            // Draw preview text on overlay canvas
            const overlayCtx = this.getOverlayContext();
            this.clearOverlay();
            overlayCtx.font = `${this.textState.fontSize}px ${this.textState.fontFamily}`;
            overlayCtx.fillStyle = this.textState.color;
            overlayCtx.fillText(this.textState.text, this.textState.x, this.textState.y);

            // Hide text modal and show preview overlay
            textModal.classList.add('hidden');
            previewOverlay.classList.remove('hidden');

            // Set up preview action buttons
            const applyBtn = document.getElementById('applyTextBtn');
            const editBtn = document.getElementById('editTextBtn');
            const cancelBtn = document.getElementById('cancelPreviewBtn');

            if (applyBtn && editBtn && cancelBtn) {
                applyBtn.onclick = () => this.applyText();
                editBtn.onclick = () => this.editText();
                cancelBtn.onclick = () => this.cancelPreview();
            }
        }
    }

    applyText() {
        if (this.textState.isPreview) {
            // Draw the text on the main canvas
            const ctx = this.getContext();
            ctx.font = `${this.textState.fontSize}px ${this.textState.fontFamily}`;
            ctx.fillStyle = this.textState.color;
            ctx.fillText(this.textState.text, this.textState.x, this.textState.y);
            
            this.clearOverlay();
            this.paintBar.saveState();
            this.hideTextControls();
            this.resetTextState();
        }
    }

    editText() {
        if (!this.textState.isPreview) return;

        // Clear the preview
        this.clearOverlay();

        // Hide preview overlay and show text modal with current text state
        const modal = document.getElementById('textModal');
        const previewOverlay = document.getElementById('textPreviewOverlay');
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontSelect');
        const fontSizeInput = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');

        if (modal && previewOverlay && textInput && fontSelect && fontSizeInput && textColor) {
            modal.classList.remove('hidden');
            previewOverlay.classList.add('hidden');
            
            textInput.value = this.textState.text;
            fontSelect.value = this.textState.fontFamily;
            fontSizeInput.value = this.textState.fontSize;
            textColor.value = this.textState.color;
            
            textInput.focus();
        }
    }

    cancelPreview() {
        this.clearOverlay();
        this.hideTextControls();
        this.resetTextState();
    }

    hideTextControls() {
        const textModal = document.getElementById('textModal');
        const previewOverlay = document.getElementById('textPreviewOverlay');
        
        if (textModal) textModal.classList.add('hidden');
        if (previewOverlay) previewOverlay.classList.add('hidden');
    }

    resetTextState() {
        this.textState = {
            text: '',
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#000000',
            x: 0,
            y: 0,
            isPreview: false
        };
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
