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
            rotation: 0,
            x: 0,
            y: 0
        };
        this.modalDrag = {
            active: false,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Get modal elements
        const textModal = document.getElementById('textModal');
        const modalHeader = textModal?.querySelector('.modal-header');
        const closeBtn = document.getElementById('closeTextBtn');
        const applyBtn = document.getElementById('applyTextBtn');
        const cancelBtn = document.getElementById('cancelTextBtn');
        
        // Setup modal drag
        if (modalHeader) {
            modalHeader.addEventListener('mousedown', (e) => this.startDragging(e));
            modalHeader.addEventListener('touchstart', (e) => this.startDragging(e), { passive: false });
            
            // Add global move and end listeners
            document.addEventListener('mousemove', (e) => this.drag(e));
            document.addEventListener('touchmove', (e) => this.drag(e), { passive: false });
            document.addEventListener('mouseup', () => this.stopDragging());
            document.addEventListener('touchend', () => this.stopDragging());
        }
        
        // Setup button listeners
        if (closeBtn) {
            closeBtn.onclick = () => this.hideTextControls();
        }
        
        if (applyBtn) {
            applyBtn.onclick = () => this.applyText();
        }
        
        if (cancelBtn) {
            cancelBtn.onclick = () => this.hideTextControls();
        }

        // Get all the text input elements
        const textInput = document.getElementById('textInput');
        const fontFamily = document.getElementById('fontFamily');
        const fontSize = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        const textRotation = document.getElementById('textRotation');
        const rotationValue = document.getElementById('rotationValue');

        const updatePreview = () => {
            const text = textInput?.value || '';
            const font = fontFamily?.value || this.textState.fontFamily;
            const size = parseInt(fontSize?.value || '20');
            const color = textColor?.value || '#000000';
            const rotation = parseInt(textRotation?.value || '0');
            this.textState.text = text;
            this.textState.fontFamily = font;
            this.textState.fontSize = size;
            this.textState.color = color;
            this.textState.rotation = rotation;
            this.updatePreview();
        };

        // Add input event listeners for live preview
        textInput?.addEventListener('input', updatePreview);
        fontFamily?.addEventListener('change', updatePreview);
        fontSize?.addEventListener('input', updatePreview);
        textColor?.addEventListener('input', updatePreview);
        
        textRotation?.addEventListener('input', () => {
            const rotation = parseInt(textRotation.value);
            rotationValue.value = rotation;
            this.textState.rotation = rotation;
            updatePreview();
        });

        rotationValue?.addEventListener('input', () => {
            let rotation = parseInt(rotationValue.value) || 0;
            // Clamp the value between 0 and 365
            rotation = Math.max(0, Math.min(365, rotation));
            rotationValue.value = rotation;
            textRotation.value = rotation;
            this.textState.rotation = rotation;
            updatePreview();
        });
    }

    startDragging(e) {
        e.preventDefault();
        const textModal = document.getElementById('textModal');
        if (!textModal) return;

        // Get event coordinates (handle both mouse and touch)
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const rect = textModal.getBoundingClientRect();
        
        this.modalDrag = {
            active: true,
            startX: clientX,
            startY: clientY,
            offsetX: rect.left - clientX,
            offsetY: rect.top - clientY
        };
        
        // Add grabbing cursor
        textModal.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.modalDrag.active) return;
        e.preventDefault();
        
        const textModal = document.getElementById('textModal');
        if (!textModal) return;

        // Get event coordinates (handle both mouse and touch)
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // Calculate new position
        const left = clientX + this.modalDrag.offsetX;
        const top = clientY + this.modalDrag.offsetY;

        // Apply new position
        textModal.style.left = left + 'px';
        textModal.style.top = top + 'px';
        textModal.style.transform = 'none';  // Remove default centering
    }

    stopDragging() {
        const textModal = document.getElementById('textModal');
        if (textModal && this.modalDrag.active) {
            textModal.style.cursor = 'grab';
            this.modalDrag.active = false;
        }
    }

    updatePreview() {
        // Get the preview canvas context
        const ctx = this.paintBar.overlayCtx;
        if (!ctx) return;

        // Clear previous preview
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (this.textState.text) {
            ctx.save();
            
            // Set text properties
            ctx.font = `${this.textState.fontSize}px ${this.textState.fontFamily}`;
            ctx.fillStyle = this.textState.color;
            ctx.textBaseline = 'middle';
            
            // Measure text to find center point
            const metrics = ctx.measureText(this.textState.text);
            const textWidth = metrics.width;
            const textHeight = this.textState.fontSize;
            
            // Calculate center point
            const centerX = this.textState.x + textWidth / 2;
            const centerY = this.textState.y + textHeight / 2;
            
            // Apply rotation around center point
            ctx.translate(centerX, centerY);
            ctx.rotate(this.textState.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);
            
            // Draw the text with adjusted position for middle baseline
            ctx.fillText(this.textState.text, this.textState.x, this.textState.y + textHeight / 2);
            
            ctx.restore();
        }
    }

    clearPreview() {
        const ctx = this.paintBar.overlayCtx;
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
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
        this.paintBar.canvas.style.cursor = 'default';
        this.clearPreview();
    }

    initializeTextTool(x, y) {
        this.textState.x = x;
        this.textState.y = y;
        
        // Get modal elements
        const textModal = document.getElementById('textModal');
        const textInput = document.getElementById('textInput');
        const fontFamily = document.getElementById('fontFamily');
        const fontSize = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        const textRotation = document.getElementById('textRotation');
        const rotationValue = document.getElementById('rotationValue');

        if (textModal && textInput && fontFamily && fontSize && textColor && textRotation && rotationValue) {
            // Show modal
            textModal.classList.remove('hidden');
            
            // Reset modal position to center
            textModal.style.left = '50%';
            textModal.style.top = '50%';
            textModal.style.transform = 'translate(-50%, -50%)';
            
            // Set initial values
            textInput.value = '';
            fontFamily.value = this.textState.fontFamily;
            fontSize.value = this.textState.fontSize;
            textColor.value = this.paintBar.currentColor;
            textRotation.value = this.textState.rotation;
            rotationValue.value = this.textState.rotation;
            
            // Focus text input
            textInput.focus();

            // Clear any existing preview
            this.clearPreview();
        }
    }

    applyText() {
        // Get form values
        const textInput = document.getElementById('textInput');
        const fontFamily = document.getElementById('fontFamily');
        const fontSize = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        const textRotation = document.getElementById('textRotation');

        if (textInput && fontFamily && fontSize && textColor && textRotation) {
            const text = textInput.value.trim();
            if (text === '') {
                this.hideTextControls();
                return;
            }
            
            // Update text state
            this.textState = {
                text: text,
                fontFamily: fontFamily.value,
                fontSize: parseInt(fontSize.value),
                color: textColor.value,
                rotation: parseInt(textRotation.value),
                x: this.textState.x,
                y: this.textState.y
            };
            
            // Draw text on canvas
            const ctx = this.getContext();
            ctx.save();
            
            // Set text properties
            ctx.font = `${this.textState.fontSize}px ${this.textState.fontFamily}`;
            ctx.fillStyle = this.textState.color;
            ctx.textBaseline = 'middle';
            
            // Measure text to find center point
            const metrics = ctx.measureText(this.textState.text);
            const textWidth = metrics.width;
            const textHeight = this.textState.fontSize;
            
            // Calculate center point
            const centerX = this.textState.x + textWidth / 2;
            const centerY = this.textState.y + textHeight / 2;
            
            // Apply rotation around center point
            ctx.translate(centerX, centerY);
            ctx.rotate(this.textState.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);
            
            // Draw the text with adjusted position for middle baseline
            ctx.fillText(this.textState.text, this.textState.x, this.textState.y + textHeight / 2);
            
            ctx.restore();
            
            // Save state and cleanup
            this.paintBar.saveState();
            this.hideTextControls();
            this.resetTextState();
            this.clearPreview();
        }
    }

    hideTextControls() {
        const textModal = document.getElementById('textModal');
        if (textModal) {
            textModal.classList.add('hidden');
        }
        this.clearPreview();
    }

    resetTextState() {
        this.textState = {
            text: '',
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#000000',
            rotation: 0,
            x: 0,
            y: 0
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
