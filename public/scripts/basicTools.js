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

export class SprayTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.cursor = 'crosshair';
        this.lastX = 0;
        this.lastY = 0;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.lastX = point.x;
        this.lastY = point.y;
        this.drawSpray(point);
    }

    onMouseMove(point) {
        if (!this.isDrawing) return;
        this.drawSpray(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseUp(point) {
        if (!this.isDrawing) return;
        this.drawSpray(point);
        super.onMouseUp();
    }

    drawSpray(point) {
        const ctx = this.getContext();
        const density = 30; // Number of particles per spray
        const radius = this.paintBar.lineWidth * 2; // Spray radius based on brush size
        
        ctx.fillStyle = this.paintBar.currentColor;
        
        for (let i = 0; i < density; i++) {
            // Generate random position within the spray radius
            const angle = Math.random() * Math.PI * 2;
            const radiusRandom = Math.random() * radius;
            const sprayX = point.x + Math.cos(angle) * radiusRandom;
            const sprayY = point.y + Math.sin(angle) * radiusRandom;
            
            // Draw a small dot
            ctx.beginPath();
            ctx.arc(sprayX, sprayY, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

export class FillTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.isFilling = false;
    }

    onMouseDown(point) {
        this.fill(point);
    }

    onMouseMove(point) {
        // Fill tool operates on single clicks, no mouse move handling needed
    }

    onMouseUp(point) {
        // Fill tool operates on single clicks, no mouse up handling needed
    }

    fill(point) {
        const ctx = this.getContext();
        const imageData = ctx.getImageData(0, 0, this.paintBar.canvas.width, this.paintBar.canvas.height);
        
        // Note: Currently this creates two undo states due to putImageData interaction
        // Save a copy of the unmodified image data for undo functionality
        const undoState = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );
        this.paintBar.undoStack.push(undoState);
        if (this.paintBar.undoStack.length > this.paintBar.maxUndoStates) {
            this.paintBar.undoStack.shift();
        }
        this.paintBar.redoStack = [];
        
        const pixels = imageData.data;
        
        // Convert floating point coordinates to integers for pixel-perfect fill
        const x = Math.round(point.x);
        const y = Math.round(point.y);
        
        // Early return if click is outside canvas bounds
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return;
        }
        
        // Calculate starting pixel position in the 1D array (4 bytes per pixel: RGBA)
        const startPos = (y * imageData.width + x) * 4;
        
        // Get the color at the clicked position
        const startColor = {
            r: pixels[startPos],
            g: pixels[startPos + 1],
            b: pixels[startPos + 2],
            a: pixels[startPos + 3]
        };
        
        const fillColor = this.hexToRGBA(this.paintBar.currentColor);
        if (!fillColor) return;

        // Initialize flood fill algorithm with starting point
        const stack = [[x, y]];
        const width = imageData.width;
        const height = imageData.height;
        const visited = new Set();
        
        // Helper function to determine if a pixel should be filled
        // Uses a tolerance value for color matching and special handling for transparency
        const isSimilarColor = (pos) => {
            const targetAlpha = pixels[pos + 3];
            
            // Special handling for transparent areas (alpha < 128)
            if (startColor.a < 128) {
                // Only fill transparent and semi-transparent pixels
                return targetAlpha < 128;
            }
            
            // For solid colors, only fill if target pixel is mostly opaque
            if (targetAlpha >= 128) {
                const dr = pixels[pos] - startColor.r;
                const dg = pixels[pos + 1] - startColor.g;
                const db = pixels[pos + 2] - startColor.b;
                
                // Color similarity threshold of 40 (squared = 1600) for RGB components
                return (dr * dr + dg * dg + db * db) <= 1600;
            }
            
            // Don't fill semi-transparent pixels when starting from a solid color
            return false;
        };
        
        // Flood fill implementation using 8-way connectivity
        while (stack.length > 0) {
            const [px, py] = stack.pop();
            
            // Skip pixels outside canvas bounds
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            
            const key = `${px},${py}`;
            if (visited.has(key)) continue;
            
            const pos = (py * width + px) * 4;
            if (!isSimilarColor(pos)) continue;
            
            visited.add(key);
            
            // Apply the fill color to the current pixel
            pixels[pos] = fillColor.r;
            pixels[pos + 1] = fillColor.g;
            pixels[pos + 2] = fillColor.b;
            pixels[pos + 3] = fillColor.a * 255;
            
            // Add all 8 adjacent pixels to the stack for processing
            stack.push(
                [px + 1, py],     // right
                [px - 1, py],     // left
                [px, py + 1],     // down
                [px, py - 1],     // up
                [px + 1, py + 1], // bottom-right
                [px - 1, py - 1], // top-left
                [px + 1, py - 1], // top-right
                [px - 1, py + 1]  // bottom-left
            );
        }
        
        // Apply the modified image data back to the canvas
        ctx.putImageData(imageData, 0, 0);
    }

    // Convert hex color string to RGBA object
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
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
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

        // Style button listeners
        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const underlineBtn = document.getElementById('underlineBtn');
        const strikeBtn = document.getElementById('strikeBtn');

        const toggleStyleButton = (button, property) => {
            if (!button) return;
            button.addEventListener('click', () => {
                this.textState[property] = !this.textState[property];
                button.classList.toggle('active');
                updatePreview();
            });
        };

        toggleStyleButton(boldBtn, 'bold');
        toggleStyleButton(italicBtn, 'italic');
        toggleStyleButton(underlineBtn, 'underline');
        toggleStyleButton(strikeBtn, 'strikethrough');
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
            let fontStyle = '';
            if (this.textState.bold) fontStyle += 'bold ';
            if (this.textState.italic) fontStyle += 'italic ';
            ctx.font = `${fontStyle}${this.textState.fontSize}px ${this.textState.fontFamily}`;
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
            
            // Draw the text
            const x = this.textState.x;
            const y = this.textState.y + textHeight / 2;
            
            ctx.fillText(this.textState.text, x, y);
            
            // Draw underline and/or strikethrough
            if (this.textState.underline || this.textState.strikethrough) {
                ctx.beginPath();
                const lineWidth = Math.max(1, this.textState.fontSize / 20);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = this.textState.color;
                
                if (this.textState.underline) {
                    // Position underline 1px below text bottom (half height from middle baseline + 1)
                    const underlineY = y + (textHeight / 2) + 1;
                    ctx.moveTo(x, underlineY);
                    ctx.lineTo(x + textWidth, underlineY);
                }
                
                if (this.textState.strikethrough) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + textWidth, y);
                }
                
                ctx.stroke();
            }
            
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
            
            // Reset style buttons
            const boldBtn = document.getElementById('boldBtn');
            const italicBtn = document.getElementById('italicBtn');
            const underlineBtn = document.getElementById('underlineBtn');
            const strikeBtn = document.getElementById('strikeBtn');

            // Update button states based on text state
            if (boldBtn) boldBtn.classList.toggle('active', this.textState.bold);
            if (italicBtn) italicBtn.classList.toggle('active', this.textState.italic);
            if (underlineBtn) underlineBtn.classList.toggle('active', this.textState.underline);
            if (strikeBtn) strikeBtn.classList.toggle('active', this.textState.strikethrough);
            
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

            // Update text state (keep existing style states)
            const newState = {
                ...this.textState,  // Preserve existing states including style flags
                text: text,
                fontFamily: fontFamily.value,
                fontSize: parseInt(fontSize.value),
                color: textColor.value,
                rotation: parseInt(textRotation.value),
                x: this.textState.x,
                y: this.textState.y
            };
            this.textState = newState;

            // Draw text on canvas
            const ctx = this.getContext();
            ctx.save();
            
            // Set text properties
            let fontStyle = '';
            if (this.textState.bold) fontStyle += 'bold ';
            if (this.textState.italic) fontStyle += 'italic ';
            ctx.font = `${fontStyle}${this.textState.fontSize}px ${this.textState.fontFamily}`;
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
            
            // Draw the text
            const x = this.textState.x;
            const y = this.textState.y + textHeight / 2;
            
            ctx.fillText(this.textState.text, x, y);
            
            // Draw underline and/or strikethrough
            if (this.textState.underline || this.textState.strikethrough) {
                ctx.beginPath();
                const lineWidth = Math.max(1, this.textState.fontSize / 20);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = this.textState.color;
                
                if (this.textState.underline) {
                    // Position underline 1px below text bottom (half height from middle baseline + 1)
                    const underlineY = y + (textHeight / 2) + 1;
                    ctx.moveTo(x, underlineY);
                    ctx.lineTo(x + textWidth, underlineY);
                }
                
                if (this.textState.strikethrough) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + textWidth, y);
                }
                
                ctx.stroke();
            }
            
            ctx.restore();
            
            // Cleanup
            this.hideTextControls();
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
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            x: 0,
            y: 0
        };
    }
}
