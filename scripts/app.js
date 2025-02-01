class PaintBar {
    constructor() {
        // Initialize canvases
        this.canvas = document.getElementById('drawingCanvas');
        this.overlayCanvas = document.getElementById('selectionOverlay');
        this.transparentBgCanvas = document.getElementById('transparentBackgroundCanvas');
        this.opaqueBgCanvas = document.getElementById('opaqueBackgroundCanvas');

        // Initialize contexts
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
        if (this.overlayCanvas) {
            this.overlayCtx = this.overlayCanvas.getContext('2d');
        }
        if (this.transparentBgCanvas) {
            this.transparentBgCtx = this.transparentBgCanvas.getContext('2d');
        }
        if (this.opaqueBgCanvas) {
            this.opaqueBgCtx = this.opaqueBgCanvas.getContext('2d');
        }

        // Check for required elements
        if (!this.canvas || !this.ctx || !this.transparentBgCanvas || !this.transparentBgCtx) {
            console.error('Failed to initialize canvases', {
                canvas: !!this.canvas,
                ctx: !!this.ctx,
                transparentBgCanvas: !!this.transparentBgCanvas,
                transparentBgCtx: !!this.transparentBgCtx
            });
            return;
        }

        // Initialize properties
        this.isDrawing = false;
        this.activeTool = 'pencil';
        this.currentColor = '#000000';
        this.lineWidth = 1;
        this.fillShape = false;
        this.isTransparent = false;
        this.triangleType = 'right';
        this.lastX = 0;
        this.lastY = 0;
        this.startX = 0;
        this.startY = 0;
        
        // Initialize undo/redo
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;

        // Set up event listeners first
        this.setupEventListeners();
        this.setupToolListeners();

        // Initialize the canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Set initial styles
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Initialize background
        this.drawTransparentBackground();
        this.drawOpaqueBackground();

        // Save initial state after a brief delay to ensure canvas is sized
        requestAnimationFrame(() => {
            this.saveState();
        });
    }

    setupEventListeners() {
        console.log('Setting up event listeners');
        
        // Toolbar toggle
        const toolbarToggle = document.getElementById('toolbarToggle');
        const toolbar = document.getElementById('toolbar');
        if (toolbarToggle && toolbar) {
            toolbarToggle.addEventListener('click', () => {
                toolbar.classList.toggle('expanded');
                toolbarToggle.classList.toggle('active');
            });
        }

        // Submenu toggles
        const submenuHeaders = document.querySelectorAll('.submenu-header');
        submenuHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                if (content && content.classList.contains('submenu-content')) {
                    content.classList.toggle('expanded');
                    const toggle = header.querySelector('.submenu-toggle');
                    if (toggle) {
                        toggle.classList.toggle('rotated');
                    }
                }
            });
        });

        // Save modal close button
        const saveModalCloseBtn = document.getElementById('saveModalClose');
        const saveModal = document.getElementById('saveModal');
        if (saveModalCloseBtn && saveModal) {
            saveModalCloseBtn.addEventListener('click', () => {
                saveModal.classList.add('hidden');
            });
        }

        // Close modal when clicking outside
        if (saveModal) {
            saveModal.addEventListener('click', (e) => {
                if (e.target === saveModal) {
                    saveModal.classList.add('hidden');
                }
            });
        }

        // Mouse events for drawing
        this.canvas.addEventListener('mousedown', (e) => {
            console.log('Mouse down event', e);
            const point = this.getMousePos(e);
            this.isDrawing = true;
            this.lastX = point.x;
            this.lastY = point.y;
            this.startX = point.x;
            this.startY = point.y;

            if (this.activeTool === 'pencil') {
                this.ctx.beginPath();
                this.ctx.moveTo(point.x, point.y);
                this.ctx.strokeStyle = this.currentColor;
                this.ctx.lineWidth = this.lineWidth;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawing) return;
            console.log('Mouse move event while drawing', e);
            const point = this.getMousePos(e);

            switch (this.activeTool) {
                case 'pencil':
                    this.ctx.lineTo(point.x, point.y);
                    this.ctx.stroke();
                    break;
                case 'eraser':
                    this.erase(point.x, point.y);
                    break;
                case 'line':
                case 'rectangle':
                case 'circle':
                case 'triangle':
                    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                    this.drawShape(point.x, point.y);
                    break;
            }

            this.lastX = point.x;
            this.lastY = point.y;
        });

        document.addEventListener('mouseup', (e) => {
            if (!this.isDrawing) return;
            console.log('Mouse up event', e);
            this.isDrawing = false;

            if (['line', 'rectangle', 'circle', 'triangle'].includes(this.activeTool)) {
                this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                const point = { x: this.lastX, y: this.lastY };
                
                this.ctx.strokeStyle = this.currentColor;
                this.ctx.fillStyle = this.currentColor;
                this.ctx.lineWidth = this.lineWidth;

                switch (this.activeTool) {
                    case 'line':
                        this.ctx.beginPath();
                        this.ctx.moveTo(this.startX, this.startY);
                        this.ctx.lineTo(point.x, point.y);
                        this.ctx.stroke();
                        break;
                    case 'rectangle':
                        const width = point.x - this.startX;
                        const height = point.y - this.startY;
                        if (this.fillShape) {
                            this.ctx.fillRect(this.startX, this.startY, width, height);
                        }
                        this.ctx.strokeRect(this.startX, this.startY, width, height);
                        break;
                    case 'circle':
                        const dx = point.x - this.startX;
                        const dy = point.y - this.startY;
                        const radius = Math.sqrt(dx * dx + dy * dy);
                        this.ctx.beginPath();
                        this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
                        if (this.fillShape) {
                            this.ctx.fill();
                        }
                        this.ctx.stroke();
                        break;
                    case 'triangle':
                        const points = this.calculateTrianglePoints(point);
                        this.ctx.beginPath();
                        this.ctx.moveTo(points[0].x, points[0].y);
                        this.ctx.lineTo(points[1].x, points[1].y);
                        this.ctx.lineTo(points[2].x, points[2].y);
                        this.ctx.closePath();
                        if (this.fillShape) {
                            this.ctx.fill();
                        }
                        this.ctx.stroke();
                        break;
                }
            }

            if (this.activeTool === 'pencil') {
                this.ctx.closePath();
            }

            this.saveState();
        });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => {
            console.log('Context menu event prevented');
            e.preventDefault();
        });

        // Log initial canvas state
        console.log('Canvas dimensions:', {
            width: this.canvas.width,
            height: this.canvas.height,
            clientWidth: this.canvas.clientWidth,
            clientHeight: this.canvas.clientHeight
        });
    }

    setupToolListeners() {
        // Tool buttons
        const tools = ['pencil', 'eraser', 'line', 'rectangle', 'circle', 'triangle', 'fill', 'text', 'select'];
        tools.forEach(tool => {
            const button = document.getElementById(`${tool}Btn`);
            if (button) {
                button.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent submenu toggle
                    this.setActiveTool(tool);
                });
            }
        });

        // Line width control
        const lineWidth = document.getElementById('lineWidth');
        if (lineWidth) {
            lineWidth.addEventListener('input', (e) => {
                this.lineWidth = parseInt(e.target.value);
                this.ctx.lineWidth = this.lineWidth;
            });
        }

        // Fill shape toggle
        const fillToggle = document.getElementById('fillToggle');
        if (fillToggle) {
            fillToggle.addEventListener('change', (e) => {
                this.fillShape = e.target.checked;
            });
        }

        // Triangle type selector
        const triangleType = document.getElementById('triangle-type');
        if (triangleType) {
            triangleType.addEventListener('change', (e) => {
                this.triangleType = e.target.value;
            });
        }

        // Save button
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent submenu toggle
                const modal = document.getElementById('saveModal');
                if (modal) {
                    modal.classList.remove('hidden');
                }
            });
        }

        // Color picker
        const colorPicker = document.getElementById('colorPicker');
        if (colorPicker) {
            const picker = new iro.ColorPicker('#colorPicker', {
                width: 150,
                color: this.currentColor
            });

            picker.on('color:change', (color) => {
                this.currentColor = color.hexString;
                this.ctx.strokeStyle = this.currentColor;
                this.ctx.fillStyle = this.currentColor;
            });
        }
    }

    setActiveTool(tool) {
        // Remove active class from all tools
        const tools = document.querySelectorAll('.tool-btn');
        tools.forEach(btn => btn.classList.remove('active'));

        // Add active class to selected tool
        const selectedTool = document.getElementById(`${tool}Btn`);
        if (selectedTool) {
            selectedTool.classList.add('active');
        }

        this.activeTool = tool;

        // Show/hide triangle type selector
        const triangleType = document.getElementById('triangle-type');
        if (triangleType) {
            triangleType.style.display = tool === 'triangle' ? 'block' : 'none';
        }

        // Update cursor style
        this.updateCursorStyle(tool);
    }

    updateCursorStyle(tool) {
        const canvas = document.getElementById('drawingCanvas');
        if (!canvas) return;

        switch (tool) {
            case 'eraser':
                canvas.style.cursor = 'cell';
                break;
            case 'text':
                canvas.style.cursor = 'text';
                break;
            case 'fill':
            case 'select':
            default:
                canvas.style.cursor = 'crosshair';
                break;
        }
    }

    resizeCanvas() {
        const container = document.querySelector('.canvas-wrapper');
        if (!container) {
            console.error('Canvas container not found');
            return;
        }

        const width = Math.max(container.clientWidth, 100);  // Minimum width of 100px
        const height = Math.max(container.clientHeight, 100);  // Minimum height of 100px

        console.log('Resizing canvas to:', { width, height });

        // Resize all canvases
        [this.canvas, this.overlayCanvas, this.transparentBgCanvas, this.opaqueBgCanvas].forEach(canvas => {
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
                canvas.style.width = width + 'px';
                canvas.style.height = height + 'px';
            }
        });

        // Redraw backgrounds after resize
        this.drawTransparentBackground();
        this.drawOpaqueBackground();

        // Restore drawing context properties
        if (this.ctx) {
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.fillStyle = this.currentColor;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
        }
    }

    drawTransparentBackground() {
        if (!this.transparentBgCanvas || !this.transparentBgCtx) return;

        const pattern = document.createElement('canvas');
        pattern.width = 20;
        pattern.height = 20;
        const patternCtx = pattern.getContext('2d');
        
        if (!patternCtx) return;

        // Draw checkerboard pattern
        patternCtx.fillStyle = '#ffffff';
        patternCtx.fillRect(0, 0, 20, 20);
        patternCtx.fillStyle = '#e0e0e0';
        patternCtx.fillRect(0, 0, 10, 10);
        patternCtx.fillRect(10, 10, 10, 10);

        // Create pattern and fill background
        const bgPattern = this.transparentBgCtx.createPattern(pattern, 'repeat');
        if (bgPattern) {
            this.transparentBgCtx.fillStyle = bgPattern;
            this.transparentBgCtx.fillRect(0, 0, this.transparentBgCanvas.width, this.transparentBgCanvas.height);
        }
    }

    drawOpaqueBackground() {
        if (!this.opaqueBgCanvas || !this.opaqueBgCtx) return;
        
        this.opaqueBgCtx.fillStyle = '#ffffff';
        this.opaqueBgCtx.fillRect(0, 0, this.opaqueBgCanvas.width, this.opaqueBgCanvas.height);
    }

    saveState() {
        if (!this.canvas || !this.ctx) return;
        
        // Only save state if canvas has valid dimensions
        if (this.canvas.width <= 0 || this.canvas.height <= 0) {
            console.warn('Cannot save state: Invalid canvas dimensions', {
                width: this.canvas.width,
                height: this.canvas.height
            });
            return;
        }

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.undoStack.push(imageData);
        
        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
        
        // Clear redo stack when new action is performed
        this.redoStack = [];
    }

    drawShape(x, y) {
        if (!this.isDrawing) return;

        // Clear the overlay canvas for preview
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        // Set up overlay context styles
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = this.currentColor;
        this.overlayCtx.fillStyle = this.currentColor;
        this.overlayCtx.lineWidth = this.lineWidth;

        switch (this.activeTool) {
            case 'line':
                this.overlayCtx.beginPath();
                this.overlayCtx.moveTo(this.startX, this.startY);
                this.overlayCtx.lineTo(x, y);
                this.overlayCtx.stroke();
                break;
            case 'rectangle':
                const width = x - this.startX;
                const height = y - this.startY;
                if (this.fillShape) {
                    this.overlayCtx.fillRect(this.startX, this.startY, width, height);
                }
                this.overlayCtx.strokeRect(this.startX, this.startY, width, height);
                break;
            case 'circle':
                this.drawCircle({ clientX: x, clientY: y });
                break;
            case 'triangle':
                this.drawTriangle({ clientX: x, clientY: y });
                break;
        }

        this.overlayCtx.restore();
    }

    drawCircle(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        // Draw preview circle
        this.overlayCtx.beginPath();
        const dx = pos.x - this.startX;
        const dy = pos.y - this.startY;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        // Draw from center point
        this.overlayCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        
        // Apply current stroke and fill settings
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = this.currentColor;
        this.overlayCtx.lineWidth = this.lineWidth;
        this.overlayCtx.fillStyle = this.currentColor;
        
        if (this.fillShape) {
            this.overlayCtx.fill();
        }
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
    }

    drawTriangle(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        let points;
        const dx = pos.x - this.startX;
        const dy = pos.y - this.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        switch (this.triangleType) {
            case 'isosceles': {
                // For isosceles with 30-degree apex angle and equal sides
                const apexAngle = Math.PI / 6; // 30 degrees in radians
                const sideLength = distance; // Both equal sides will be this length
                
                // Calculate the base width using the apex angle
                const baseWidth = 2 * sideLength * Math.sin(apexAngle / 2);
                
                // Calculate the height using the apex angle
                const height = sideLength * Math.cos(apexAngle / 2);
                
                // Calculate the direction vector
                const dirX = dx / distance;
                const dirY = dy / distance;
                
                // Calculate the perpendicular vector
                const perpX = -dirY;
                const perpY = dirX;
                
                // Calculate the base center point
                const baseCenterX = this.startX + dirX * height;
                const baseCenterY = this.startY + dirY * height;
                
                // Calculate the base points
                const baseLeftX = baseCenterX - perpX * (baseWidth / 2);
                const baseLeftY = baseCenterY - perpY * (baseWidth / 2);
                const baseRightX = baseCenterX + perpX * (baseWidth / 2);
                const baseRightY = baseCenterY + perpY * (baseWidth / 2);
                
                points = [
                    { x: this.startX, y: this.startY },  // Apex
                    { x: baseLeftX, y: baseLeftY },      // Left base point
                    { x: baseRightX, y: baseRightY }     // Right base point
                ];
                break;
            }
            case 'equilateral': {
                // For equilateral, all sides should be equal length and all angles 60 degrees
                const sideLength = distance;
                
                // First point is the start point (apex)
                const p1 = { x: this.startX, y: this.startY };
                
                // Second point is where the mouse is
                const p2 = { x: pos.x, y: pos.y };
                
                // Third point is 60 degrees (pi/3 radians) from the line p1->p2
                const baseAngle = Math.atan2(dy, dx);
                const thirdPointAngle = baseAngle + Math.PI / 3;
                const p3 = {
                    x: this.startX + sideLength * Math.cos(thirdPointAngle),
                    y: this.startY + sideLength * Math.sin(thirdPointAngle)
                };
                
                points = [p1, p2, p3];
                break;
            }
            default: { // right triangle
                points = [
                    { x: this.startX, y: this.startY },
                    { x: this.startX, y: pos.y },
                    { x: pos.x, y: pos.y }
                ];
                break;
            }
        }
        
        // Draw the triangle preview
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(points[0].x, points[0].y);
        this.overlayCtx.lineTo(points[1].x, points[1].y);
        this.overlayCtx.lineTo(points[2].x, points[2].y);
        this.overlayCtx.closePath();
        
        // Apply current stroke and fill settings
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = this.currentColor;
        this.overlayCtx.lineWidth = this.lineWidth;
        this.overlayCtx.fillStyle = this.currentColor;
        
        if (this.fillShape) {
            this.overlayCtx.fill();
        }
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
    }

    calculateTrianglePoints(endPoint) {
        const dx = endPoint.x - this.startX;
        const dy = endPoint.y - this.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        switch (this.triangleType) {
            case 'isosceles': {
                // For isosceles with 30-degree apex angle and equal sides
                const apexAngle = Math.PI / 6; // 30 degrees in radians
                const sideLength = distance; // Both equal sides will be this length
                
                // Calculate the base width using the apex angle
                const baseWidth = 2 * sideLength * Math.sin(apexAngle / 2);
                
                // Calculate the height using the apex angle
                const height = sideLength * Math.cos(apexAngle / 2);
                
                // Calculate the direction vector
                const dirX = dx / distance;
                const dirY = dy / distance;
                
                // Calculate the perpendicular vector
                const perpX = -dirY;
                const perpY = dirX;
                
                // Calculate the base center point
                const baseCenterX = this.startX + dirX * height;
                const baseCenterY = this.startY + dirY * height;
                
                // Calculate the base points
                const baseLeftX = baseCenterX - perpX * (baseWidth / 2);
                const baseLeftY = baseCenterY - perpY * (baseWidth / 2);
                const baseRightX = baseCenterX + perpX * (baseWidth / 2);
                const baseRightY = baseCenterY + perpY * (baseWidth / 2);
                
                return [
                    { x: this.startX, y: this.startY },  // Apex
                    { x: baseLeftX, y: baseLeftY },      // Left base point
                    { x: baseRightX, y: baseRightY }     // Right base point
                ];
            }
            case 'equilateral': {
                // For equilateral, all sides should be equal length and all angles 60 degrees
                const sideLength = distance;
                
                // First point is the start point (apex)
                const p1 = { x: this.startX, y: this.startY };
                
                // Second point is where the mouse is
                const p2 = { x: endPoint.x, y: endPoint.y };
                
                // Third point is 60 degrees (pi/3 radians) from the line p1->p2
                const baseAngle = Math.atan2(dy, dx);
                const thirdPointAngle = baseAngle + Math.PI / 3;
                const p3 = {
                    x: this.startX + sideLength * Math.cos(thirdPointAngle),
                    y: this.startY + sideLength * Math.sin(thirdPointAngle)
                };
                
                return [p1, p2, p3];
            }
            default: { // right triangle
                return [
                    { x: this.startX, y: this.startY },
                    { x: this.startX, y: endPoint.y },
                    { x: endPoint.x, y: endPoint.y }
                ];
            }
        }
    }

    erase(x, y) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.lineWidth / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getEventPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.paintBar = new PaintBar();
});
