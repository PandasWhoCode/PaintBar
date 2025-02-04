import { SaveManager } from './save.js';
import { ToolManager } from './toolManager.js';

class PaintBar {
    constructor() {
        // Canvas layers
        this.transparentBgCanvas = document.getElementById('transparentBackgroundCanvas');
        this.transparentBgCtx = this.transparentBgCanvas.getContext('2d');
        
        this.opaqueBgCanvas = document.getElementById('opaqueBackgroundCanvas');
        this.opaqueBgCtx = this.opaqueBgCanvas.getContext('2d');
        
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        this.overlayCanvas = document.getElementById('selectionOverlay');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Initialize properties
        this.isDrawing = false;
        this.currentColor = '#000000';
        this.lineWidth = 5;
        this.fillShape = false;
        this.startX = 0;
        this.startY = 0;
        this.lastX = 0;
        this.lastY = 0;
        this.defaultWidth = 800;
        this.defaultHeight = 600;
        this.isTransparent = false;
        this.recentColors = ['#000000']; // Start with black
        this.maxRecentColors = 10;
        this.triangleType = 'equilateral';
        
        // Initialize history stacks
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;

        // Initialize text state
        this.textState = {
            text: '',
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#000000',
            x: 0,
            y: 0,
            isPreview: false
        };

        // Initialize managers
        this.toolManager = new ToolManager(this);
        this.saveManager = new SaveManager(this);

        // Initialize the application
        this.initializeState();
        this.initializeElements();
        this.initializeCanvas();
        this.setupEventListeners();
        
        // Debug logging
        console.log('Initial tool:', this.toolManager.activeTool);
        console.log('Transparency button:', document.getElementById('transparencyBtn'));
    }

    initializeState() {
        // Set initial canvas state
        this.canvas.width = this.defaultWidth;
        this.canvas.height = this.defaultHeight;
        
        // Set initial drawing state
        this.ctx.strokeStyle = '#000000';
        this.ctx.fillStyle = '#000000';
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    initializeElements() {
        // Get canvas
        this.canvas = document.getElementById('drawingCanvas');
        if (!this.canvas) {
            console.error('Canvas not found');
            return;
        }

        // Get context
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!this.ctx) {
            console.error('Could not get canvas context');
            return;
        }

        // Initialize toolbar elements
        this.toolbar = document.getElementById('toolbar');
        this.toolbarToggle = document.getElementById('toolbarToggle');
        this.toolbarHandle = document.getElementById('toolbarHandle');
        this.canvasContainer = document.querySelector('.canvas-container');

        // Initialize color elements
        this.colorButtons = document.querySelectorAll('.color-btn');
        this.colorPreview = document.getElementById('color-preview');
        this.colorValue = document.getElementById('color-value');
        this.eyedropperBtn = document.getElementById('eyedropperBtn');
        this.recentColors = [];
        this.maxRecentColors = 10;
        this.isPickingColor = false;

        // Initialize color picker
        this.colorPicker = new iro.ColorPicker('#color-picker', {
            width: 75,
            color: '#000000',
            layout: [
                { 
                    component: iro.ui.Wheel,
                    options: {}
                },
                { 
                    component: iro.ui.Slider,
                    options: {
                        sliderType: 'value'
                    }
                }
            ]
        });

        // Set initial color
        this.currentColor = '#000000';
        this.updateColorPreview(this.currentColor);

        // Add color picker event listener
        this.colorPicker.on('color:change', (color) => {
            this.currentColor = color.hexString;
            this.updateColorPreview(this.currentColor);
        });

        // Initialize brush size
        this.brushSize = document.getElementById('brushSize');
        this.brushSizeLabel = document.getElementById('brushSizeLabel');
        
        // Initialize tool buttons
        this.pencilBtn = document.getElementById('pencilBtn');
        this.eraserBtn = document.getElementById('eraserBtn');
        this.fillBtn = document.getElementById('fillBtn');
        this.textBtn = document.getElementById('textBtn');
        this.selectBtn = document.getElementById('selectBtn');
        this.rectangleBtn = document.getElementById('rectangleBtn');
        this.circleBtn = document.getElementById('circleBtn');
        this.lineBtn = document.getElementById('lineBtn');
        this.triangleBtn = document.getElementById('triangleBtn');
        this.triangleOptions = document.getElementById('triangle-type');
        
        // Initialize action buttons
        this.cropBtn = document.getElementById('cropBtn');
        this.pasteBtn = document.getElementById('pasteBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        // Initialize modals and their elements
        this.textModal = document.getElementById('textModal');
        this.applyTextBtn = document.getElementById('applyTextBtn');
        this.textInput = document.getElementById('textInput');
        this.cancelTextBtn = document.getElementById('cancelTextBtn');
        this.closeTextBtn = document.getElementById('closeTextBtn');
        
        // Initialize brush size
        if (this.brushSize && this.brushSizeLabel) {
            this.brushSize.value = 5;
            this.brushSizeLabel.textContent = this.brushSize.value;
        }

        // Initialize the canvas
        this.initializeCanvas();
    }

    initializeUI() {
        // Initialize canvas settings
        this.canvasSettingsBtn = document.getElementById('canvasSettingsBtn');
        this.canvasSettingsBtn.addEventListener('click', () => {
            document.getElementById('settingsModal').classList.remove('hidden');
        });

        // Fix text tool cursor and selection
        this.textBtn = document.getElementById('textBtn');
        this.textBtn.addEventListener('click', () => {
            if (this.toolManager.activeTool === 'text') {
                this.canvas.style.cursor = 'text';
                this.textBtn.classList.add('active');
            }
        });

        // Fix fill tool
        this.fillBtn = document.getElementById('fillBtn');
        this.fillBtn.addEventListener('click', () => {
            this.toolManager.setActiveTool('fill');
            this.updateActiveButton(this.fillBtn);
        });
    }

    toggleToolbar() {
        if (!this.toolbar) return;
        
        this.toolbar.classList.toggle('expanded');
        if (this.toolbarToggle) {
            this.toolbarToggle.classList.toggle('active');
        }
        
        // Update canvas container margin
        if (this.canvasContainer) {
            this.canvasContainer.classList.toggle('toolbar-visible');
        }
    }

    initializeCanvas() {
        // Set canvas sizes
        const canvasContainer = document.querySelector('.canvas-container');
        if (!canvasContainer) return;

        // Set size for all canvas layers
        [this.transparentBgCanvas, this.opaqueBgCanvas, this.canvas, this.overlayCanvas].forEach(canvas => {
            canvas.width = this.defaultWidth;
            canvas.height = this.defaultHeight;
        });

        // Initialize transparent background
        this.drawTransparentBackground();

        // Initialize opaque background
        this.opaqueBgCtx.fillStyle = '#ffffff';
        this.opaqueBgCtx.fillRect(0, 0, this.opaqueBgCanvas.width, this.opaqueBgCanvas.height);

        // Initialize drawing canvas
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Initialize overlay canvas
        this.overlayCtx.strokeStyle = this.currentColor;
        this.overlayCtx.fillStyle = this.currentColor;
        this.overlayCtx.lineWidth = this.lineWidth;
        this.overlayCtx.lineCap = 'round';
        this.overlayCtx.lineJoin = 'round';

        // Set initial transparency state
        const wrapper = this.canvas.parentElement;
        if (this.isTransparent) {
            wrapper.classList.add('transparent-mode');
        }
        
        // Save initial state
        this.saveState();
    }

    drawTransparentBackground() {
        // Create checkerboard pattern for transparent background
        const size = 10;
        const ctx = this.transparentBgCtx;
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.transparentBgCanvas.width, this.transparentBgCanvas.height);
        
        ctx.fillStyle = '#e0e0e0';
        for (let i = 0; i < this.transparentBgCanvas.width; i += size * 2) {
            for (let j = 0; j < this.transparentBgCanvas.height; j += size * 2) {
                ctx.fillRect(i, j, size, size);
                ctx.fillRect(i + size, j + size, size, size);
            }
        }
    }

    calculateLineWidth(value) {
        // Convert slider value (1-100) to exponential line width
        // This gives finer control over smaller widths and smoother progression to larger widths
        const minWidth = 1;
        const maxWidth = 100;
        const factor = Math.log(maxWidth);
        return Math.round(Math.exp(factor * (value / 100)) * minWidth);
    }

    setupEventListeners() {
        // Create throttled versions of event handlers
        const throttledMouseMove = this.throttle(this.handleMouseMove.bind(this), 16);
        const throttledTouch = this.throttle(this.handleTouch.bind(this), 16);

        // Mouse events - attach to both drawing and overlay canvas
        [this.canvas, this.overlayCanvas].forEach(canvas => {
            canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
            canvas.addEventListener('mousemove', throttledMouseMove);
            canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
            canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
            canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        });

        // Touch events - attach to both drawing and overlay canvas
        [this.canvas, this.overlayCanvas].forEach(canvas => {
            canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
            canvas.addEventListener('touchmove', throttledTouch);
            canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        });

        // Tool buttons
        const toolButtons = {
            pencil: 'pencilBtn',
            eraser: 'eraserBtn',
            fill: 'fillBtn',
            text: 'textBtn',
            select: 'selectBtn',
            rectangle: 'rectangleBtn',
            circle: 'circleBtn',
            line: 'lineBtn',
            triangle: 'triangleBtn'
        };

        Object.keys(toolButtons).forEach(tool => {
            const button = document.getElementById(toolButtons[tool]);
            if (button) {
                button.addEventListener('click', () => this.toolManager.setActiveTool(tool));
            }
        });

        // Brush size event
        const brushSize = document.getElementById('brushSize');
        const brushSizeLabel = document.getElementById('brushSizeLabel');
        
        if (brushSize) {
            brushSize.addEventListener('input', (e) => {
                this.lineWidth = this.calculateLineWidth(e.target.value);
                this.ctx.lineWidth = this.lineWidth;
                if (brushSizeLabel) {
                    brushSizeLabel.textContent = `${e.target.value}px`;
                }
            });
        }

        // Text tool events
        const textButtons = {
            preview: 'previewTextBtn',
            accept: 'acceptTextBtn',
            cancel: 'cancelTextBtn',
            close: 'closeTextBtn'
        };

        Object.keys(textButtons).forEach(action => {
            const button = document.getElementById(textButtons[action]);
            if (button) {
                button.addEventListener('click', () => {
                    switch (action) {
                        case 'preview':
                            this.previewText();
                            break;
                        case 'accept':
                            this.acceptText();
                            break;
                        case 'cancel':
                            this.cancelText();
                            break;
                        case 'close':
                            this.cancelText();
                            break;
                    }
                });
            }
        });

        // Action button events
        const actionButtons = {
            cropBtn: () => this.cropCanvas(),
            pasteBtn: () => this.pasteContent(),
            clearBtn: () => this.clearCanvas()
        };

        Object.entries(actionButtons).forEach(([btnId, handler]) => {
            const button = document.getElementById(btnId);
            if (button) {
                button.addEventListener('click', handler);
            }
        });

        // Other event listeners...
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', throttledMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', throttledTouch);
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

        // Color button events
        this.colorButtons.forEach(button => {
            button.addEventListener('click', () => {
                const color = button.dataset.color;
                this.colorPicker.color.hexString = color;
                this.updateColor(color);
                this.updateColorPreview(color);
            });
        });

        // Color picker events
        this.colorPicker.on('color:change', (color) => {
            const hexColor = color.hexString;
            this.updateColor(hexColor);
            this.updateColorPreview(hexColor);
        });

        // Eyedropper button
        if (this.eyedropperBtn) {
            this.eyedropperBtn.addEventListener('click', () => {
                this.startColorPicking();
            });

            // Add keyboard shortcut 'I' for eyedropper
            document.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                    this.startColorPicking();
                }
                // Press Escape to cancel color picking
                if (e.key === 'Escape' && this.isPickingColor) {
                    this.stopColorPicking();
                }
            });
        }

        // Canvas color picking
        if (this.canvas) {
            this.canvas.addEventListener('click', (e) => {
                if (this.isPickingColor) {
                    this.pickColor(e);
                }
            });

            this.canvas.addEventListener('mousemove', (e) => {
                if (this.isPickingColor) {
                    this.showColorPreview(e);
                }
            });
        }

        // Toolbar toggle events
        if (this.toolbarToggle && this.toolbar) {
            this.toolbarToggle.addEventListener('click', () => this.toggleToolbar());
        }
        if (this.toolbarHandle && this.toolbar) {
            this.toolbarHandle.addEventListener('click', () => this.toggleToolbar());
        }

        // Auto-hide toolbar on canvas click for mobile
        if (window.innerWidth <= 768 && this.canvas && this.toolbar) {
            this.canvas.addEventListener('click', () => {
                if (this.toolbar.classList.contains('visible')) {
                    this.toggleToolbar();
                }
            });
        }

        // Initialize submenus
        const submenus = document.querySelectorAll('.submenu');
        submenus.forEach(submenu => {
            const header = submenu.querySelector('.submenu-header');
            if (header) {
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    submenu.classList.toggle('collapsed');
                });
            }
        });

        // Submenu toggle handlers
        document.querySelectorAll('.submenu-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const toggle = header.querySelector('.submenu-toggle');
                
                // Toggle expanded class
                content.classList.toggle('expanded');
                toggle.classList.toggle('expanded');
            });
        });

        // Triangle type change event
        const triangleTypeSelect = document.getElementById('triangle-type');
        if (triangleTypeSelect) {
            triangleTypeSelect.addEventListener('change', this.handleTriangleTypeChange.bind(this));
        }

        // Transparency checkbox
        const transparentCanvas = document.getElementById('transparentCanvas');
        if (transparentCanvas) {
            transparentCanvas.addEventListener('change', () => {
                if (this.isTransparent !== transparentCanvas.checked) {
                    this.toggleTransparency();
                }
            });
        }
    }

    setActiveTool(tool) {
        this.toolManager.setActiveTool(tool);
    }

    handleMouseDown(e) {
        const point = this.getMousePos(e);
        this.startX = point.x;
        this.startY = point.y;
        this.lastX = point.x;
        this.lastY = point.y;
        this.isDrawing = true;
        
        this.toolManager.handleMouseDown(point);
    }

    handleMouseMove(e) {
        if (!this.isDrawing) return;
        
        const point = this.getMousePos(e);
        this.lastX = point.x;
        this.lastY = point.y;
        
        this.toolManager.handleMouseMove(point);
    }

    handleMouseUp(e) {
        if (!this.isDrawing) return;
        
        const point = this.getMousePos(e);
        this.toolManager.handleMouseUp(point);
        
        this.isDrawing = false;
        this.saveState();
    }

    handleCanvasClick(e) {
        const point = this.getMousePos(e);
        this.toolManager.handleMouseDown(point);
        this.toolManager.handleMouseUp(point);
    }

    handleTextTool(e) {
        const point = this.getEventPoint(e);
        this.initializeTextTool(point.x, point.y);
    }

    initializeTextTool(x, y) {
        this.textX = x;
        this.textY = y;
        this.isAddingText = true;

        const modal = document.getElementById('textModal');
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontFamily');
        const fontSizeInput = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        const previewBtn = document.getElementById('previewTextBtn');
        const cancelBtn = document.getElementById('cancelModalBtn');
        const closeBtn = document.getElementById('closeTextBtn');

        if (!modal || !textInput || !fontSelect || !fontSizeInput || !textColor || !previewBtn || !cancelBtn || !closeBtn) {
            console.error('Text tool elements not found');
            return;
        }

        // Show modal
        modal.classList.remove('hidden');
        textInput.value = '';
        textColor.value = this.currentColor;

        // Remove old event listeners if they exist
        const newPreviewBtn = previewBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newCloseBtn = closeBtn.cloneNode(true);
        previewBtn.parentNode.replaceChild(newPreviewBtn, previewBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        // Add new event listeners
        newPreviewBtn.addEventListener('click', () => this.previewText());
        newCancelBtn.addEventListener('click', () => this.cancelText());
        newCloseBtn.addEventListener('click', () => this.cancelText());

        // Handle Enter key
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.previewText();
            }
        });
    }

    previewText() {
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontFamily');
        const fontSizeInput = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        const modal = document.getElementById('textModal');
        const previewOverlay = document.getElementById('textPreviewOverlay');
        const applyBtn = document.getElementById('applyTextBtn');
        const editBtn = document.getElementById('editTextBtn');
        const cancelPreviewBtn = document.getElementById('cancelPreviewBtn');

        if (modal && previewOverlay && this.textState) {
            // Store text properties for later use
            this.textState = {
                text: textInput.value,
                font: fontSelect.value,
                size: fontSizeInput.value,
                color: textColor.value,
                x: this.textX,
                y: this.textY
            };

            // Draw preview text
            this.ctx.font = `${this.textState.size}px ${this.textState.font}`;
            this.ctx.fillStyle = this.textState.color;
            this.ctx.fillText(this.textState.text, this.textState.x, this.textState.y);

            // Hide text modal and show preview overlay
            modal.classList.add('hidden');
            previewOverlay.classList.remove('hidden');

            // Remove old event listeners if they exist
            const newApplyBtn = applyBtn.cloneNode(true);
            const newEditBtn = editBtn.cloneNode(true);
            const newCancelBtn = cancelPreviewBtn.cloneNode(true);
            applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
            editBtn.parentNode.replaceChild(newEditBtn, editBtn);
            cancelPreviewBtn.parentNode.replaceChild(newCancelBtn, cancelPreviewBtn);

            // Add new event listeners for preview actions
            newApplyBtn.addEventListener('click', () => this.applyText());
            newEditBtn.addEventListener('click', () => this.editText());
            newCancelBtn.addEventListener('click', () => this.cancelPreview());
        }
    }

    applyText() {
        // Text is already drawn, just need to save state and clean up
        this.saveState();
        this.hideTextControls();
        this.resetTextState();
    }

    editText() {
        // Restore canvas to state before preview
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Hide preview overlay and show text modal with current text state
        const modal = document.getElementById('textModal');
        const previewOverlay = document.getElementById('textPreviewOverlay');
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontFamily');
        const fontSizeInput = document.getElementById('fontSize');
        const textColor = document.getElementById('textColor');
        
        if (modal && previewOverlay && this.textState) {
            // Restore text input values
            if (textInput) textInput.value = this.textState.text;
            if (fontSelect) fontSelect.value = this.textState.font;
            if (fontSizeInput) fontSizeInput.value = this.textState.size;
            if (textColor) textColor.value = this.textState.color;

            // Show modal and hide preview
            previewOverlay.classList.add('hidden');
            modal.classList.remove('hidden');
        }
    }

    cancelPreview() {
        // Restore canvas to state before preview
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.hideTextControls();
        this.resetTextState();
    }

    hideTextControls() {
        const modal = document.getElementById('textModal');
        const previewOverlay = document.getElementById('textPreviewOverlay');
        const textInput = document.getElementById('textInput');
        
        if (modal) modal.classList.add('hidden');
        if (previewOverlay) previewOverlay.classList.add('hidden');
        if (textInput) textInput.value = '';
    }

    resetTextState() {
        this.isAddingText = false;
        this.textState = {
            text: '',
            font: 'Arial',
            size: 20,
            color: '#000000',
            x: 0,
            y: 0
        };
    }

    drawFreehand(x, y) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
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

    drawShape(ctx, points, shouldFill = false) {
        if (!ctx || !points || points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        
        ctx.closePath();
        
        if (shouldFill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawCircleShape(ctx, center, radius, shouldFill = false) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        if (shouldFill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawCircle(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        const { distance } = this.calculateDistance(
            { x: this.startX, y: this.startY },
            pos
        );
        
        this.applyCanvasStyle(this.overlayCtx);
        this.drawCircleShape(this.overlayCtx, pos, distance, this.fillShape);
        this.overlayCtx.restore();
    }

    calculateTrianglePoints(pos, type) {
        const metrics = this.calculateDistance(
            { x: this.startX, y: this.startY },
            pos
        );
        
        switch (type) {
            case 'equilateral': {
                const angle60 = Math.PI / 3;
                return [
                    { x: this.startX, y: this.startY },
                    { x: pos.x, y: pos.y },
                    {
                        x: this.startX + metrics.distance * Math.cos(metrics.angle + angle60),
                        y: this.startY + metrics.distance * Math.sin(metrics.angle + angle60)
                    }
                ];
            }
            case 'isosceles': {
                // Base follows cursor y position, width based on x distance
                const halfBaseWidth = Math.abs(metrics.dx);
                return [
                    { x: this.startX, y: this.startY },  // Apex
                    { x: pos.x - halfBaseWidth, y: pos.y }, // Left base point
                    { x: pos.x + halfBaseWidth, y: pos.y }  // Right base point
                ];
            }
            case 'right':
            default: {
                return [
                    { x: this.startX, y: this.startY },
                    { x: pos.x, y: this.startY },
                    { x: pos.x, y: pos.y }
                ];
            }
        }
    }

    drawTriangle(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        const points = this.calculateTrianglePoints(pos, this.triangleType);
        
        this.applyCanvasStyle(this.overlayCtx);
        this.drawShape(this.overlayCtx, points, this.fillShape);
        this.overlayCtx.restore();
    }

    handleMouseUp(e) {
        if (this.toolManager.activeTool === 'select') {
            if (this.isSelecting) {
                this.isSelecting = false;
                this.captureSelection();
            } else if (this.isMovingSelection) {
                this.isMovingSelection = false;
                this.commitSelection();
            }
            return;
        }

        if (this.isDrawing) {
            const point = this.getMousePos(e);

            if (['rectangle', 'circle', 'line', 'triangle'].includes(this.toolManager.activeTool)) {
                this.applyCanvasStyle(this.ctx);

                switch (this.toolManager.activeTool) {
                    case 'line': {
                        this.drawShape(this.ctx, [
                            { x: this.startX, y: this.startY },
                            point
                        ]);
                        break;
                    }
                    case 'rectangle': {
                        const width = point.x - this.startX;
                        const height = point.y - this.startY;
                        if (this.fillShape) {
                            this.ctx.fillRect(this.startX, this.startY, width, height);
                        }
                        this.ctx.strokeRect(this.startX, this.startY, width, height);
                        break;
                    }
                    case 'circle': {
                        const { distance } = this.calculateDistance(
                            { x: this.startX, y: this.startY },
                            point
                        );
                        this.drawCircleShape(this.ctx, point, distance, this.fillShape);
                        break;
                    }
                    case 'triangle': {
                        const points = this.calculateTrianglePoints(point, this.triangleType);
                        this.drawShape(this.ctx, points, this.fillShape);
                        break;
                    }
                }
                this.ctx.restore();
                this.clearOverlay();
            }

            this.isDrawing = false;
            this.saveState();
        }
    }

    moveSelection(dx, dy) {
        if (!this.selectedArea || !this.selectionImageData) return;

        // Calculate new position with bounds checking
        const newX = Math.max(0, Math.min(this.canvas.width - this.selectedArea.width, this.selectedArea.x + dx));
        const newY = Math.max(0, Math.min(this.canvas.height - this.selectedArea.height, this.selectedArea.y + dy));

        if (newX === this.selectedArea.x && newY === this.selectedArea.y) return;

        // Restore the original background state
        if (this.selectedArea.backgroundState) {
            this.ctx.putImageData(this.selectedArea.backgroundState, 0, 0);
        }

        // Draw the selection at the new position
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.selectedArea.width;
        tempCanvas.height = this.selectedArea.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(this.selectionImageData, 0, 0);

        // Clear the area where we'll place the selection
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
        this.ctx.fillRect(newX, newY, this.selectedArea.width, this.selectedArea.height);
        this.ctx.restore();

        // Draw the selection
        this.ctx.drawImage(tempCanvas, newX, newY);

        // Update selection coordinates
        this.selectedArea.x = newX;
        this.selectedArea.y = newY;
        this.selectionStart = { x: newX, y: newY };
        this.selectionEnd = { 
            x: newX + this.selectedArea.width, 
            y: newY + this.selectedArea.height 
        };

        // Update overlay
        this.drawSelectionOverlay();

        // Cleanup
        tempCanvas.remove();
    }

    erase(x, y) {
        // Save current context settings
        this.ctx.save();
        
        // Set composite operation to clear pixels
        this.ctx.globalCompositeOperation = 'destination-out';
        
        // Draw a line from last position to current position
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);
        this.ctx.strokeStyle = '#000';  // Color doesn't matter due to composite operation
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
        
        // Restore context settings
        this.ctx.restore();
    }

    handleCanvasClick(e) {
        const pos = this.getEventPoint(e);
        if (this.toolManager.activeTool === 'fill') {
            this.floodFill(Math.round(pos.x), Math.round(pos.y), this.currentColor);
            this.saveState();
        } else if (this.toolManager.activeTool === 'text') {
            this.handleTextTool(e);
        }
    }

    floodFill(startX, startY, fillColor) {
        // Get image data
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;

        // Get target color (the color we're replacing)
        const startPos = (startY * this.canvas.width + startX) * 4;
        const targetR = pixels[startPos];
        const targetG = pixels[startPos + 1];
        const targetB = pixels[startPos + 2];
        const targetA = pixels[startPos + 3];

        // Convert fill color from hex to RGBA
        const fillColorRGBA = this.hexToRGBA(fillColor);
        
        // Don't fill if the target color is the same as the fill color
        if (this.colorsMatch(
            [targetR, targetG, targetB, targetA],
            [fillColorRGBA.r, fillColorRGBA.g, fillColorRGBA.b, fillColorRGBA.a * 255]
        )) {
            return;
        }

        // Stack for flood fill
        const stack = [[startX, startY]];
        const width = this.canvas.width;
        const height = this.canvas.height;

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const pos = (y * width + x) * 4;

            // Skip if out of bounds or not matching target color
            if (x < 0 || x >= width || y < 0 || y >= height ||
                !this.colorsMatch(
                    [pixels[pos], pixels[pos + 1], pixels[pos + 2], pixels[pos + 3]],
                    [targetR, targetG, targetB, targetA]
                )) {
                continue;
            }

            // Fill the pixel
            pixels[pos] = fillColorRGBA.r;
            pixels[pos + 1] = fillColorRGBA.g;
            pixels[pos + 2] = fillColorRGBA.b;
            pixels[pos + 3] = fillColorRGBA.a * 255;

            // Add adjacent pixels to stack
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        // Update canvas with filled area
        this.ctx.putImageData(imageData, 0, 0);
    }

    colorsMatch(color1, color2, tolerance = 1) {
        return Math.abs(color1[0] - color2[0]) <= tolerance &&
               Math.abs(color1[1] - color2[1]) <= tolerance &&
               Math.abs(color1[2] - color2[2]) <= tolerance &&
               Math.abs(color1[3] - color2[3]) <= tolerance;
    }

    hexToRGBA(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b, a: 1 };
    }

    updateColor(color) {
        this.currentColor = color;
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.updateRecentColors(color);
    }

    updateRecentColors(color) {
        // Don't add if it's the same as the most recent color
        if (this.recentColors[0] === color) return;
        
        // Remove color if it exists in the list
        this.recentColors = this.recentColors.filter(c => c !== color);
        
        // Add to front of array
        this.recentColors.unshift(color);
        
        // Keep only the most recent colors
        if (this.recentColors.length > this.maxRecentColors) {
            this.recentColors = this.recentColors.slice(0, this.maxRecentColors);
        }
        
        // Update the UI
        this.renderRecentColors();
    }

    renderRecentColors() {
        const recentColorsContainer = document.getElementById('recentColors');
        if (!recentColorsContainer) return;
        
        // Clear existing colors
        recentColorsContainer.innerHTML = '';
        
        // Add color buttons
        this.recentColors.forEach(color => {
            const colorBtn = document.createElement('button');
            colorBtn.className = 'recent-color-btn';
            colorBtn.style.backgroundColor = color;
            colorBtn.title = color;
            
            // Add active class to current color
            if (color === this.currentColor) {
                colorBtn.classList.add('active');
            }
            
            colorBtn.addEventListener('click', () => {
                this.updateColor(color);
            });
            
            recentColorsContainer.appendChild(colorBtn);
        });
    }

    updateColorPreview(color) {
        if (this.colorPreview) {
            this.colorPreview.style.backgroundColor = color;
        }
        if (this.colorValue) {
            this.colorValue.textContent = color;
        }
    }

    startColorPicking() {
        this.isPickingColor = true;
        this.canvas.style.cursor = 'crosshair';
        if (this.eyedropperBtn) {
            this.eyedropperBtn.classList.add('active');
        }
    }

    pickColor(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pixel = this.ctx.getImageData(x, y, 1, 1).data;
        const color = `#${[pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('')}`;
        
        this.currentColor = color;
        this.colorPicker.color.hexString = color;
        this.updateColorPreview(color);
        this.stopColorPicking();
    }

    stopColorPicking() {
        this.isPickingColor = false;
        this.canvas.style.cursor = 'crosshair';
        if (this.eyedropperBtn) {
            this.eyedropperBtn.classList.remove('active');
        }
    }

    showColorPreview(e) {
        const pos = this.getEventPoint(e);
        const pixel = this.ctx.getImageData(pos.x, pos.y, 1, 1).data;
        const color = `#${[pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('')}`;
        
        // Update color picker preview
        if (this.colorPicker) {
            this.colorPicker.color.hexString = color;
        }
    }

    updateTextPreview() {
        const textInput = document.getElementById('textInput');
        const textPreview = document.getElementById('textPreview');
        const fontSelect = document.getElementById('fontSelect');
        const fontSizeInput = document.getElementById('fontSize');

        if (textPreview && textInput) {
            const text = textInput.value || 'Preview';
            const font = fontSelect.value;
            const fontSize = fontSizeInput.value;

            textPreview.style.fontFamily = font;
            textPreview.style.fontSize = `${fontSize}px`;
            textPreview.style.color = this.currentColor;
            textPreview.textContent = text;
        }
    }

    addTextToCanvas() {
        const textInput = document.getElementById('textInput');
        const fontSelect = document.getElementById('fontSelect');
        const fontSizeInput = document.getElementById('fontSize');

        const text = textInput.value;
        const font = fontSelect.value;
        const fontSize = fontSizeInput.value;

        this.ctx.font = `${fontSize}px ${font}`;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.fillText(text, this.textX, this.textY);

        // Save state for undo
        this.saveState();
    }

    // Shape drawing utilities
    applyCanvasStyle(ctx) {
        ctx.save();
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.lineWidth;
        ctx.fillStyle = this.currentColor;
    }

    drawShape(ctx, points, shouldFill = false) {
        if (!ctx || !points || points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        
        ctx.closePath();
        
        if (shouldFill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawCircleShape(ctx, center, radius, shouldFill = false) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        if (shouldFill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawCircle(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        const { distance } = this.calculateDistance(
            { x: this.startX, y: this.startY },
            pos
        );
        
        this.applyCanvasStyle(this.overlayCtx);
        this.drawCircleShape(this.overlayCtx, pos, distance, this.fillShape);
        this.overlayCtx.restore();
    }

    calculateTrianglePoints(pos, type) {
        const metrics = this.calculateDistance(
            { x: this.startX, y: this.startY },
            pos
        );
        
        switch (type) {
            case 'equilateral': {
                const angle60 = Math.PI / 3;
                return [
                    { x: this.startX, y: this.startY },
                    { x: pos.x, y: pos.y },
                    {
                        x: this.startX + metrics.distance * Math.cos(metrics.angle + angle60),
                        y: this.startY + metrics.distance * Math.sin(metrics.angle + angle60)
                    }
                ];
            }
            case 'isosceles': {
                // Base follows cursor y position, width based on x distance
                const halfBaseWidth = Math.abs(metrics.dx);
                return [
                    { x: this.startX, y: this.startY },  // Apex
                    { x: pos.x - halfBaseWidth, y: pos.y }, // Left base point
                    { x: pos.x + halfBaseWidth, y: pos.y }  // Right base point
                ];
            }
            case 'right':
            default: {
                return [
                    { x: this.startX, y: this.startY },
                    { x: pos.x, y: this.startY },
                    { x: pos.x, y: pos.y }
                ];
            }
        }
    }

    drawTriangle(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        const points = this.calculateTrianglePoints(pos, this.triangleType);
        
        this.applyCanvasStyle(this.overlayCtx);
        this.drawShape(this.overlayCtx, points, this.fillShape);
        this.overlayCtx.restore();
    }

    handleMouseUp(e) {
        if (this.toolManager.activeTool === 'select') {
            if (this.isSelecting) {
                this.isSelecting = false;
                this.captureSelection();
            } else if (this.isMovingSelection) {
                this.isMovingSelection = false;
                this.commitSelection();
            }
            return;
        }

        if (this.isDrawing) {
            const point = this.getMousePos(e);

            if (['rectangle', 'circle', 'line', 'triangle'].includes(this.toolManager.activeTool)) {
                this.applyCanvasStyle(this.ctx);

                switch (this.toolManager.activeTool) {
                    case 'line': {
                        this.drawShape(this.ctx, [
                            { x: this.startX, y: this.startY },
                            point
                        ]);
                        break;
                    }
                    case 'rectangle': {
                        const width = point.x - this.startX;
                        const height = point.y - this.startY;
                        if (this.fillShape) {
                            this.ctx.fillRect(this.startX, this.startY, width, height);
                        }
                        this.ctx.strokeRect(this.startX, this.startY, width, height);
                        break;
                    }
                    case 'circle': {
                        const { distance } = this.calculateDistance(
                            { x: this.startX, y: this.startY },
                            point
                        );
                        this.drawCircleShape(this.ctx, point, distance, this.fillShape);
                        break;
                    }
                    case 'triangle': {
                        const points = this.calculateTrianglePoints(point, this.triangleType);
                        this.drawShape(this.ctx, points, this.fillShape);
                        break;
                    }
                }
                this.ctx.restore();
                this.clearOverlay();
            }

            this.isDrawing = false;
            this.saveState();
        }
    }

    // Selection tool methods
    captureSelection() {
        const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
        const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);

        if (width < 1 || height < 1) {
            this.clearSelection();
            return;
        }

        // Store the current drawing canvas state before any modifications
        this.selectedArea = {
            x, y, width, height,
            backgroundState: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
        };

        // Create a temporary canvas to isolate drawing layer content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        // Copy only the selected area from the drawing canvas
        tempCtx.drawImage(
            this.canvas,
            x, y, width, height,  // Source coordinates
            0, 0, width, height   // Destination coordinates
        );

        // Get the image data and process it to remove background
        const imageData = tempCtx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // If background is opaque (white), make those pixels transparent
        for (let i = 0; i < data.length; i += 4) {
            const isWhite = data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255;
            if (isWhite) {
                data[i + 3] = 0; // Set alpha to 0 for white pixels
            }
        }
        
        // Store the processed image data
        this.selectionImageData = imageData;

        // Clear the selected area in the drawing canvas
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
        this.ctx.fillRect(x, y, width, height);
        this.ctx.restore();

        // Draw the selection overlay
        this.drawSelectionOverlay();

        // Clean up
        tempCanvas.remove();
    }

    moveSelection(dx, dy) {
        if (!this.selectedArea || !this.selectionImageData) return;

        // Calculate new position
        const newX = this.selectedArea.x + dx;
        const newY = this.selectedArea.y + dy;

        // Restore the original background state
        this.ctx.putImageData(this.selectedArea.backgroundState, 0, 0);

        // Clear the area where we'll place the selection
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
        this.ctx.fillRect(newX, newY, this.selectedArea.width, this.selectedArea.height);
        this.ctx.restore();

        // Draw the selection at the new position
        this.ctx.putImageData(this.selectionImageData, newX, newY);

        // Update the selection position
        this.selectedArea.x = newX;
        this.selectedArea.y = newY;

        // Update selection coordinates
        const dx2 = newX - this.selectedArea.x;
        const dy2 = newY - this.selectedArea.y;
        this.selectionStart.x += dx2;
        this.selectionStart.y += dy2;
        this.selectionEnd.x += dx2;
        this.selectionEnd.y += dy2;

        // Update the selection overlay
        this.drawSelectionOverlay();
    }

    handleMouseMove(e) {
        if (!this.isDrawing && !this.isSelecting && !this.isMovingSelection) return;

        const point = this.getMousePos(e);

        if (this.isMovingSelection) {
            const dx = point.x - this.lastX;
            const dy = point.y - this.lastY;
            this.moveSelection(dx, dy);
        } else if (this.isSelecting) {
            this.selectionEnd = point;
            this.clearOverlay();
            this.drawSelectionBox();
        } else {
            if (this.toolManager.activeTool === 'pencil') {
                this.drawFreehand(point.x, point.y);
            } else if (this.toolManager.activeTool === 'eraser') {
                this.erase(point.x, point.y);
            } else if (['rectangle', 'circle', 'line', 'triangle'].includes(this.toolManager.activeTool)) {
                // Clear previous preview
                this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

                // Draw new preview
                this.overlayCtx.save();
                this.overlayCtx.strokeStyle = this.currentColor;
                this.overlayCtx.fillStyle = this.currentColor;
                this.overlayCtx.lineWidth = this.lineWidth;
                this.overlayCtx.lineCap = 'round';
                this.overlayCtx.lineJoin = 'round';

                switch (this.toolManager.activeTool) {
                    case 'line':
                        this.drawShape(this.overlayCtx, [
                            { x: this.startX, y: this.startY },
                            point
                        ]);
                        break;
                    case 'rectangle': {
                        const width = point.x - this.startX;
                        const height = point.y - this.startY;
                        if (this.fillShape) {
                            this.overlayCtx.globalAlpha = 0.5;
                            this.overlayCtx.fillRect(this.startX, this.startY, width, height);
                            this.overlayCtx.globalAlpha = 1;
                        }
                        this.overlayCtx.strokeRect(this.startX, this.startY, width, height);
                        break;
                    }
                    case 'circle': {
                        const { distance } = this.calculateDistance(
                            { x: this.startX, y: this.startY },
                            point
                        );
                        this.drawCircleShape(this.overlayCtx, point, distance, this.fillShape);
                        break;
                    }
                    case 'triangle': {
                        const points = this.calculateTrianglePoints(point, this.triangleType);
                        this.drawShape(this.overlayCtx, points, this.fillShape);
                        break;
                    }
                }

                this.overlayCtx.restore();
            }
        }

        this.lastX = point.x;
        this.lastY = point.y;
    }

    isPointInSelection(x, y) {
        if (!this.selectedArea) return false;

        return (
            x >= this.selectedArea.x &&
            x <= this.selectedArea.x + this.selectedArea.width &&
            y >= this.selectedArea.y &&
            y <= this.selectedArea.y + this.selectedArea.height
        );
    }

    finalizeSelection() {
        if (this.selectedArea) {
            this.commitSelection();
        }
    }

    cancelText() {
        if (this.textModal) {
            this.textModal.classList.add('hidden');
        }
        if (this.activeTextArea) {
            this.activeTextArea.remove();
            this.activeTextArea = null;
        }
    }

    handleTriangleTypeChange(e) {
        this.triangleType = e.target.value;
    }

    toggleTransparency() {
        this.isTransparent = !this.isTransparent;

        // Toggle visibility of background layers
        if (this.isTransparent) {
            this.transparentBgCanvas.style.display = 'block';
            this.opaqueBgCanvas.style.display = 'none';
        } else {
            this.transparentBgCanvas.style.display = 'none';
            this.opaqueBgCanvas.style.display = 'block';
        }

        // Update transparency button state if it exists
        const transparencyBtn = document.getElementById('transparencyBtn');
        if (transparencyBtn) {
            transparencyBtn.classList.toggle('active', this.isTransparent);
        }
    }

    commitSelection() {
        if (!this.selectedArea || !this.selectionImageData) return;

        // The current state is already correct since we've been updating it
        // Just save the state and clear selection data
        this.saveState();
        this.clearSelection();
    }

    clearSelection() {
        if (this.selectedArea && this.selectedArea.backgroundState) {
            // Restore the original state if we're canceling the selection
            this.ctx.putImageData(this.selectedArea.backgroundState, 0, 0);
        }

        // Clear selection data
        this.selectedArea = null;
        this.selectionImageData = null;
        this.isSelecting = false;
        this.isMovingSelection = false;

        // Clear the overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    saveState() {
        // Create a new canvas to store the current state
        const stateCanvas = document.createElement('canvas');
        stateCanvas.width = this.canvas.width;
        stateCanvas.height = this.canvas.height;
        const stateCtx = stateCanvas.getContext('2d');
        stateCtx.drawImage(this.canvas, 0, 0);

        // Add to undo stack
        this.undoStack.push(stateCanvas);

        // Clear redo stack since we've made a new change
        this.redoStack = [];

        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
    }

    handleCanvasClick(e) {
        const pos = this.getEventPoint(e);
        if (this.toolManager.activeTool === 'fill') {
            this.floodFill(Math.round(pos.x), Math.round(pos.y), this.currentColor);
            this.saveState();
        } else if (this.toolManager.activeTool === 'text') {
            this.handleTextTool(e);
        }
    }

    getEventPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const point = e.touches ? e.touches[0] : e;
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: (point.clientX - rect.left) * scaleX,
            y: (point.clientY - rect.top) * scaleY
        };
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseMove(mouseEvent);
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseDown(mouseEvent);
    }

    startDrawing(event) {
        if (this.toolManager.activeTool === 'text') return;

        this.isDrawing = true;
        const pos = this.getEventPoint(event);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.startX = pos.x;  // Store start position for shapes
        this.startY = pos.y;
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            // Save state after completing a drawing action
            this.saveState();
        }
    }

    drawCircle(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);

        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        const { distance } = this.calculateDistance(
            { x: this.startX, y: this.startY },
            pos
        );

        this.applyCanvasStyle(this.overlayCtx);
        this.drawCircleShape(this.overlayCtx, pos, distance, this.fillShape);
        this.overlayCtx.restore();
    }

    drawTriangle(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);

        // Clear overlay canvas
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        const points = this.calculateTrianglePoints(pos, this.triangleType);

        this.applyCanvasStyle(this.overlayCtx);
        this.drawShape(this.overlayCtx, points, this.fillShape);
        this.overlayCtx.restore();
    }

    handleMouseUp(e) {
        if (this.toolManager.activeTool === 'select') {
            if (this.isSelecting) {
                this.isSelecting = false;
                this.captureSelection();
            } else if (this.isMovingSelection) {
                this.isMovingSelection = false;
                this.commitSelection();
            }
            return;
        }

        if (this.isDrawing) {
            const point = this.getMousePos(e);

            if (['rectangle', 'circle', 'line', 'triangle'].includes(this.toolManager.activeTool)) {
                this.applyCanvasStyle(this.ctx);

                switch (this.toolManager.activeTool) {
                    case 'line': {
                        this.drawShape(this.ctx, [
                            { x: this.startX, y: this.startY },
                            point
                        ]);
                        break;
                    }
                    case 'rectangle': {
                        const width = point.x - this.startX;
                        const height = point.y - this.startY;
                        if (this.fillShape) {
                            this.ctx.fillRect(this.startX, this.startY, width, height);
                        }
                        this.ctx.strokeRect(this.startX, this.startY, width, height);
                        break;
                    }
                    case 'circle': {
                        const { distance } = this.calculateDistance(
                            { x: this.startX, y: this.startY },
                            point
                        );
                        this.drawCircleShape(this.ctx, point, distance, this.fillShape);
                        break;
                    }
                    case 'triangle': {
                        const points = this.calculateTrianglePoints(point, this.triangleType);
                        this.drawShape(this.ctx, points, this.fillShape);
                        break;
                    }
                }
                this.ctx.restore();
                this.clearOverlay();
            }

            this.isDrawing = false;
            this.saveState();
        }
    }

    handleMouseUp(e) {
        if (this.toolManager.activeTool === 'text' || !this.isDrawing) return;

        const point = this.getMousePos(e);

        if (this.isMovingSelection) {
            this.isMovingSelection = false;
            this.commitSelection();
            return;
        }

        if (this.isSelecting) {
            this.isSelecting = false;
            this.finalizeSelection();
            return;
        }

        if (['rectangle', 'circle', 'line', 'triangle'].includes(this.toolManager.activeTool)) {
            this.ctx.save();
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.fillStyle = this.currentColor;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            switch (this.toolManager.activeTool) {
                case 'line':
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.startX, this.startY);
                    this.ctx.lineTo(point.x, point.y);
                    this.ctx.stroke();
                    break;
                case 'rectangle': {
                    const width = point.x - this.startX;
                    const height = point.y - this.startY;
                    if (this.fillShape) {
                        this.ctx.fillRect(this.startX, this.startY, width, height);
                    }
                    this.ctx.strokeRect(this.startX, this.startY, width, height);
                    break;
                }
                case 'circle': {
                    const radius = Math.sqrt(
                        Math.pow(point.x - this.startX, 2) +
                        Math.pow(point.y - this.startY, 2)
                    );
                    this.ctx.beginPath();
                    this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
                    if (this.fillShape) {
                        this.ctx.fill();
                    }
                    this.ctx.stroke();
                    break;
                }
                case 'triangle': {
                    const trianglePoints = this.calculateTrianglePoints(point, this.triangleType);
                    this.ctx.beginPath();
                    this.ctx.moveTo(trianglePoints[0].x, trianglePoints[0].y);
                    this.ctx.lineTo(trianglePoints[1].x, trianglePoints[1].y);
                    this.ctx.lineTo(trianglePoints[2].x, trianglePoints[2].y);
                    this.ctx.closePath();
                    if (this.fillShape) {
                        this.ctx.fill();
                    }
                    this.ctx.stroke();
                    break;
                }
            }
            this.ctx.restore();
            this.clearOverlay();
        }

        this.isDrawing = false;
        this.saveState();
    }

    clearOverlay() {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    calculateDistance(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return {
            dx,
            dy,
            distance: Math.sqrt(dx * dx + dy * dy),
            angle: Math.atan2(dy, dx)
        };
    }

    // Shape drawing utilities
    applyCanvasStyle(ctx) {
        ctx.save();
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.lineWidth;
        ctx.fillStyle = this.currentColor;
    }

    showSaveModal() {
        this.saveManager.showSaveModal();
    }

    hideSaveModal() {
        this.saveManager.hideSaveModal();
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const paintBar = new PaintBar();
});
