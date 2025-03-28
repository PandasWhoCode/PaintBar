/**
 * PaintBar - A modern web-based drawing application
 * Features include:
 * - Multiple drawing tools (pencil, shapes, eraser)
 * - Color management with recent colors
 * - Canvas state management (undo/redo)
 * - Touch device support
 * - Transparency support
 */

import { SaveManager } from './save.js';
import { ToolManager } from './toolManager.js';
import { CanvasManager } from './canvasManager.js';

/**
 * PaintBar class representing the drawing application
 */
class PaintBar {
    /**
     * Constructor to initialize the application
     * @param {Object} options - Configuration options
     * @param {number} options.width - Canvas width (default: 800)
     * @param {number} options.height - Canvas height (default: 600)
     * @param {boolean} options.responsive - Enable responsive canvas (default: true)
     * @param {number} options.minWidth - Minimum canvas width (default: 300)
     * @param {number} options.minHeight - Minimum canvas height (default: 200)
     * @param {number} options.maxWidth - Maximum canvas width (default: 4096)
     * @param {number} options.maxHeight - Maximum canvas height (default: 4096)
     * @param {boolean} options.isSquare - Whether the canvas is locked to square dimensions (default: false)
     */
    constructor(options = {}) {
        // Initialize multiple canvas layers for different purposes
        // 1. transparentBgCanvas: Shows transparency grid
        // 2. opaqueBgCanvas: Solid background when transparency is off
        // 3. canvas: Main drawing surface
        // 4. overlayCanvas: Temporary shapes preview
        this.transparentBgCanvas = document.getElementById('transparentBackgroundCanvas');
        this.transparentBgCtx = this.transparentBgCanvas.getContext('2d');
        
        this.opaqueBgCanvas = document.getElementById('opaqueBackgroundCanvas');
        this.opaqueBgCtx = this.opaqueBgCanvas.getContext('2d');
        
        this.canvas = document.getElementById('drawingCanvas');
        // Enable willReadFrequently for better performance with pixel manipulation
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        this.overlayCanvas = document.getElementById('selectionOverlay');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Store square state
        this.isSquare = options.isSquare || false;

        // If square is enabled, make sure width and height are equal
        if (this.isSquare) {
            const size = Math.min(options.width || 800, options.height || 600);
            options.width = size;
            options.height = size;
        }

        // Initialize canvas dimensions
        this.canvasWidth = options.width || 800;
        this.canvasHeight = options.height || 600;
        this.minWidth = options.minWidth || 300;
        this.minHeight = options.minHeight || 200;
        this.maxWidth = options.maxWidth || 4096;
        this.maxHeight = options.maxHeight || 4096;

        // If square, adjust min/max dimensions to be equal
        if (this.isSquare) {
            const minSize = Math.max(this.minWidth, this.minHeight);
            const maxSize = Math.min(this.maxWidth, this.maxHeight);
            this.minWidth = this.minHeight = minSize;
            this.maxWidth = this.maxHeight = maxSize;
        }

        // Drawing state properties
        this.isDrawing = false;          // Whether user is currently drawing
        this.currentColor = '#000000';   // Active color (default: black)
        this.lineWidth = 5;              // Brush size
        this.fillShape = false;          // Whether to fill shapes
        this.startX = 0;                 // Starting X coordinate for shapes
        this.startY = 0;                 // Starting Y coordinate for shapes
        this.lastX = 0;                  // Last X position for continuous drawing
        this.lastY = 0;                  // Last Y position for continuous drawing
        
        // Canvas properties
        this.defaultWidth = options.width || 800;         // Default canvas width
        this.defaultHeight = options.height || 600;        // Default canvas height
        this.isTransparent = false;      // Transparency mode
        
        // Color management
        this.recentColors = ['#000000']; // Track recently used colors
        this.maxRecentColors = 10;       // Maximum number of recent colors to remember
        
        // Shape properties
        this.triangleType = 'equilateral'; // Type of triangle to draw

        // State management for undo/redo
        this.undoStack = [];             // Stack of canvas states for undo
        this.redoStack = [];             // Stack of canvas states for redo
        this.maxUndoStates = 20;         // Maximum number of states to keep

        // Utility function for throttling frequent events
        this.throttle = (func, limit) => {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            }
        };

        // Initialize tool, save, and canvas managers
        this.toolManager = new ToolManager(this);
        this.saveManager = new SaveManager(this);
        this.canvasManager = new CanvasManager(this, {
            width: this.defaultWidth,
            height: this.defaultHeight,
            responsive: options.responsive,
            minWidth: this.minWidth,
            minHeight: this.minHeight,
            maxWidth: this.maxWidth,
            maxHeight: this.maxHeight
        });

        // Set up the application
        this.initializeState();
        this.initializeElements();
        this.initializeUI();
        this.addRecentColor(this.currentColor);
        this.initializeCanvas();  // Initialize canvas after all UI elements are set
        this.setupEventListeners();
    }

    /**
     * Initialize the canvas state
     */
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

    /**
     * Initialize the UI elements
     */
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
        this.eyedropperBtn = document.getElementById('eyedropperBtn');
        this.recentColors = [];
        this.maxRecentColors = 10;
        this.isPickingColor = false;

        // Initialize color picker
        this.colorPicker = new iro.ColorPicker('#color-picker', {
            width: 100,
            color: this.currentColor,
            layout: [
                { 
                    component: iro.ui.Wheel,
                    options: {}
                },
                { 
                    component: iro.ui.Slider,
                    options: {
                        sliderType: 'value',
                        width: 120,
                        height: 36
                    }
                },
                {
                    component: iro.ui.Box,
                    options: {
                        width: 120,
                        height: 36
                    }
                }
            ],
            display: 'inline-block'
        });

        // Set initial color
        this.currentColor = '#000000';
        this.updateColorPreview(this.currentColor);

        // Add color picker event listener
        this.colorPicker.on('color:change', (color) => {
            this.currentColor = color.hexString;
            this.updateColorPreview(this.currentColor);
            
            // Update hex input when color picker changes
            const hexInput = document.getElementById('hexInput');
            if (hexInput) {
                hexInput.value = color.hexString;
            }
        });

        // Add mouse up event to track recent colors
        const colorPickerEl = document.getElementById('color-picker');
        if (colorPickerEl) {
            colorPickerEl.addEventListener('mouseup', () => {
                this.addRecentColor(this.currentColor);
            });
            colorPickerEl.addEventListener('touchend', () => {
                this.addRecentColor(this.currentColor);
            });
        }

        // Initialize hex input
        const hexInput = document.getElementById('hexInput');
        if (hexInput) {
            // Set initial value
            hexInput.value = this.currentColor;
            
            // Add input event listener
            hexInput.addEventListener('input', (e) => {
                let value = e.target.value;
                
                // Add # if missing
                if (value[0] !== '#') {
                    value = '#' + value;
                    e.target.value = value;
                }
                
                // Validate hex color format
                if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    this.currentColor = value;
                    this.colorPicker.color.hexString = value;
                    this.updateColorPreview(value);
                    this.updateColor(value);
                    this.addRecentColor(value);
                }
            });

            // Add blur event to format incomplete values
            hexInput.addEventListener('blur', (e) => {
                let value = e.target.value;
                
                // Add # if missing
                if (value[0] !== '#') {
                    value = '#' + value;
                }
                
                // Pad with zeros if needed
                while (value.length < 7) {
                    value += '0';
                }
                
                // Update if valid
                if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    e.target.value = value;
                    this.currentColor = value;
                    this.colorPicker.color.hexString = value;
                    this.updateColorPreview(value);
                    this.updateColor(value);
                } else {
                    // Reset to current color if invalid
                    e.target.value = this.currentColor;
                }
            });
        }

        // Initialize brush size
        this.brushSize = document.getElementById('brushSize');
        this.brushSizeLabel = document.getElementById('brushSizeLabel');
        
        // Initialize tool buttons
        this.pencilBtn = document.getElementById('pencilBtn');
        this.eraserBtn = document.getElementById('eraserBtn');
        this.sprayBtn = document.getElementById('sprayBtn');
        this.fillBtn = document.getElementById('fillBtn');
        this.textBtn = document.getElementById('textBtn');
        this.selectBtn = document.getElementById('selectBtn');
        this.rectangleBtn = document.getElementById('rectangleBtn');
        this.circleBtn = document.getElementById('circleBtn');
        this.lineBtn = document.getElementById('lineBtn');
        this.triangleBtn = document.getElementById('triangleBtn');
        this.arcBtn = document.getElementById('arcBtn');
        this.triangleMenu = document.getElementById('triangle-menu');
        
        // Initialize action buttons
        this.pasteBtn = document.getElementById('pasteBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        
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

    }

    /**
     * Initialize UI elements and event listeners
     */
    initializeUI() {
        // Initialize canvas settings
        this.canvasSettingsBtn = document.getElementById('canvasSettingsBtn');
        if (this.canvasSettingsBtn) {
            this.canvasSettingsBtn.addEventListener('click', () => {
                const settingsModal = document.getElementById('settingsModal');
                if (settingsModal) {
                    settingsModal.classList.remove('hidden');
                }
            });
        }

        // Fix text tool cursor and selection
        if (this.textBtn) {
            this.textBtn.addEventListener('click', () => {
                if (this.toolManager.activeTool === 'text') {
                    this.canvas.style.cursor = 'text';
                    this.textBtn.classList.add('active');
                }
            });
        }

        // Fix fill tool
        if (this.fillBtn) {
            this.fillBtn.addEventListener('click', () => {
                this.toolManager.setActiveTool('fill');
                this.updateActiveButton(this.fillBtn);
            });
        }
    }

    /**
     * Toggle toolbar visibility
     */
    toggleToolbar() {
        this.toolbarToggle.classList.toggle('active');
        this.toolbar.classList.toggle('expanded');
        this.canvasContainer.classList.toggle('toolbar-visible');
        
        // Reset position when toggling
        this.toolbarToggle.style.transform = 'translate3d(0px, 0px, 0)';
    }

    /**
     * Initialize the canvas
     */
    initializeCanvas() {
        // Initialize canvases through the canvas manager
        this.canvasManager.initializeCanvases();

        // Set initial transparency state
        const wrapper = this.canvas.parentElement;
        if (wrapper) {
            wrapper.classList.toggle('transparent', this.isTransparent);
        }
    }

    /**
     * Draw a transparent background
     */
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

    /**
     * Calculate the line width based on the slider value
     * @param {number} value - Slider value (1-100)
     * @returns {number} Calculated line width
     */
    calculateLineWidth(value) {
        // Convert slider value (1-100) to exponential line width
        // This gives finer control over smaller widths and smoother progression to larger widths
        const minWidth = 1;
        const maxWidth = 100;
        const factor = Math.log(maxWidth);
        return Math.round(Math.exp(factor * (value / 100)) * minWidth);
    }

    /**
     * Set up event listeners for the application
     */
    setupEventListeners() {
        // Initialize drag functionality
        this.initializeDrag();

        // Create throttled versions of event handlers
        this.throttledMouseMove = this.throttle((e) => this.handleMouseMove(e), 16);

        // Add event listeners to both main canvas and overlay canvas
        [this.canvas, this.overlayCanvas].forEach(canvas => {
            canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
            canvas.addEventListener('mousemove', this.throttledMouseMove);
            canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
            canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

            // Touch events for mobile support
            canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
            canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
            canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
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
            triangle: 'triangleBtn',
            arc: 'arcBtn',
            spray: 'sprayBtn'
        };

        Object.keys(toolButtons).forEach(tool => {
            const button = document.getElementById(toolButtons[tool]);
            if (button) {
                button.addEventListener('click', () => {
                    this.setActiveTool(tool);
                    this.updateActiveButton(button);
                });
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

        // Action button events
        const actionButtons = {
            pasteBtn: () => this.pasteContent(),
            clearBtn: () => this.clearCanvas(),
            undoBtn: () => this.undo(),
            redoBtn: () => this.redo()
        };

        Object.entries(actionButtons).forEach(([btnId, handler]) => {
            const button = document.getElementById(btnId);
            if (button) {
                button.addEventListener('click', handler);
            }
        });

        // Other event listeners...
        // Color button events
        this.colorButtons.forEach(button => {
            button.addEventListener('click', () => {
                const color = button.dataset.color;
                this.currentColor = color;
                this.colorPicker.color.hexString = color;
                this.updateColor(color);
                this.updateColorPreview(color);
            });
        });

        // Color picker events
        // this.colorPicker.on('color:change', (color) => {
        //     const hexColor = color.hexString;
        //     this.updateColor(hexColor);
        //     this.updateColorPreview(hexColor);
        // });

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

        // Triangle button and type selection
        const triangleBtn = document.getElementById('triangleBtn');
        const triangleTypeSelect = document.getElementById('triangle-type');
        
        if (triangleBtn && triangleTypeSelect) {
            // Show/hide triangle type select when triangle tool is activated
            this.toolManager.onToolChange = (tool) => {
                const isTriangleTool = tool.constructor.name === 'TriangleTool';
                triangleTypeSelect.style.display = isTriangleTool ? 'block' : 'none';
            };

            // Handle triangle type changes
            triangleTypeSelect.addEventListener('change', (e) => {
                this.triangleType = e.target.value;
            });

            // Set initial state
            triangleTypeSelect.style.display = 'none';
            this.triangleType = 'equilateral';
            triangleTypeSelect.value = 'equilateral';
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
        
        // Mouse event listeners for drawing
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', this.throttledMouseMove);
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseout', (e) => this.handleMouseUp(e));

        // Clear button
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCanvas());
        }

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Undo: Cmd/Ctrl + Z
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            // Redo: Cmd/Ctrl + Shift + Z
            else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
                e.preventDefault();
                this.redo();
            }
        });
    }

    /**
     * Initialize drag functionality for toolbar toggle
     */
    initializeDrag() {
        if (!this.toolbarToggle) return;

        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        const getTransformOffset = () => {
            const transform = window.getComputedStyle(this.toolbarToggle).transform;
            if (transform === 'none') return { x: 0, y: 0 };
            
            const matrix = new DOMMatrix(transform);
            return { x: matrix.m41, y: matrix.m42 };
        };

        const dragStart = (e) => {
            // Get current transform position
            const currentTransform = getTransformOffset();
            xOffset = currentTransform.x;
            yOffset = currentTransform.y;

            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            
            if (e.target === this.toolbarToggle) {
                isDragging = true;
                this.toolbarToggle.classList.add('dragging');
            }
        };

        const dragEnd = () => {
            if (!isDragging) return;
            
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            this.toolbarToggle.classList.remove('dragging');
        };

        const drag = (e) => {
            if (!isDragging) return;
            
            e.preventDefault();

            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            // Keep the button within the window bounds
            const bounds = this.toolbarToggle.getBoundingClientRect();
            const maxX = window.innerWidth - bounds.width;
            const maxY = window.innerHeight - bounds.height;
            
            currentX = Math.min(Math.max(currentX, 0), maxX);
            currentY = Math.min(Math.max(currentY, 0), maxY);

            this.toolbarToggle.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        };

        // Mouse events
        this.toolbarToggle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Touch events
        this.toolbarToggle.addEventListener('touchstart', dragStart);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', dragEnd);
    }

    /**
     * Set the active tool
     * @param {string} tool - Tool name
     */
    setActiveTool(tool) {
        this.toolManager.setActiveTool(tool);
    }

    /**
     * Update the active button state in the toolbar
     * @param {HTMLElement} activeButton - The button to set as active
     */
    updateActiveButton(activeButton) {
        // Remove active class from all tool buttons
        const toolButtons = document.querySelectorAll('.tool-button');
        toolButtons.forEach(button => button.classList.remove('active'));
        
        // Add active class to the clicked button
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    /**
     * Handle mouse down event
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        
        if (this.toolManager.activeTool) {
            const toolName = this.toolManager.activeTool.constructor.name.toLowerCase().replace('tool', '');
            
            // Save state before any operation begins, except for fill tool which handles its own state
            if (toolName !== 'fill') {
                this.saveState();
            }
            
            // Set isDrawing for tools that use continuous drawing
            if (!['fill', 'text'].includes(toolName)) {
                this.isDrawing = true;
            }
        }
        
        // Start position for drawing
        this.startX = pos.x;
        this.startY = pos.y;
        this.lastX = pos.x;
        this.lastY = pos.y;
        
        // Handle the tool action
        this.toolManager.handleMouseDown(pos);
    }

    /**
     * Handle mouse move event
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseMove(e) {
        const point = this.getMousePos(e);
        if (this.isDrawing) {
            this.toolManager.handleMouseMove(point);
        }
    }

    /**
     * Handle mouse up event
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseUp(e) {
        if (!this.isDrawing) return;
        
        const point = this.getMousePos(e);
        const toolName = this.toolManager.activeTool.constructor.name.toLowerCase().replace('tool', '');
        
        if (toolName === 'select') {
            if (this.isSelecting) {
                // Handle selection completion
                this.isSelecting = false;
                this.selectionEnd = point;
                this.createSelectionFromPoints();
            }
        }
        
        this.toolManager.handleMouseUp(point);
        this.isDrawing = false;
    }

    /**
     * Get mouse position
     * @param {MouseEvent} e - Mouse event
     * @returns {Object} Mouse position
     */
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Save the current state
     */
    saveState() {
        // Get the current canvas state
        const state = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // Add to undo stack
        this.undoStack.push(state);
        
        // Remove oldest state if we exceed max
        if (this.undoStack.length > this.maxUndoStates) {
            this.undoStack.shift();
        }

        // Clear redo stack since we're on a new path
        this.redoStack = [];
    }

    /**
     * Restore the last saved state (undo)
     */
    undo() {
        if (this.undoStack.length > 0) {
            // Save current state for redo
            const currentState = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.redoStack.push(currentState);

            // Get and apply the last state
            const lastState = this.undoStack.pop();
            this.ctx.putImageData(lastState, 0, 0);
        }
    }

    /**
     * Restore the last undone state (redo)
     */
    redo() {
        if (this.redoStack.length > 0) {
            // Get and apply the next state
            const nextState = this.redoStack.pop();
            this.ctx.putImageData(nextState, 0, 0);
            
            // Save the redone state to undo stack
            this.undoStack.push(nextState);
        }
    }

    /**
     * Handle touch start event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseDown(mouseEvent);
    }

    /**
     * Handle touch move event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseMove(mouseEvent);
    }

    /**
     * Handle touch end event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchEnd(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        this.handleMouseUp(mouseEvent);
    }

    /**
     * Shape drawing utilities
     */

    /**
     * Apply canvas style
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    applyCanvasStyle(ctx) {
        ctx.save();
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.lineWidth;
        ctx.fillStyle = this.currentColor;
    }

    /**
     * Draw a shape
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array<Object>} points - Shape points
     * @param {boolean} shouldFill - Whether to fill the shape
     */
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

    /**
     * Draw a circle shape
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} center - Circle center
     * @param {number} radius - Circle radius
     * @param {boolean} shouldFill - Whether to fill the circle
     */
    drawCircleShape(ctx, center, radius, shouldFill = false) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        if (shouldFill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    /**
     * Draw a circle
     * @param {MouseEvent} e - Mouse event
     */
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

    /**
     * Calculate triangle points
     * @param {Object} pos - Mouse position
     * @param {string} type - Triangle type
     * @returns {Array<Object>} Triangle points
     */
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

    /**
     * Draw a triangle
     * @param {MouseEvent} e - Mouse event
     */
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

    /**
     * Move the selection
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     */
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

    /**
     * Erase a line
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
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

    /**
     * Draw spray effect at the given position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    drawSpray(x, y) {
        const density = 30; // Number of particles per spray
        const radius = this.lineWidth * 2; // Spray radius based on brush size
        
        this.ctx.fillStyle = this.currentColor;
        
        for (let i = 0; i < density; i++) {
            // Generate random position within the spray radius
            const angle = Math.random() * Math.PI * 2;
            const radiusRandom = Math.random() * radius;
            const sprayX = x + Math.cos(angle) * radiusRandom;
            const sprayY = y + Math.sin(angle) * radiusRandom;
            
            // Draw a small dot
            this.ctx.beginPath();
            this.ctx.arc(sprayX, sprayY, 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    /**
     * Handle mouse move for spray tool
     * @param {MouseEvent} e - Mouse event
     */
    handleSprayMove(e) {
        if (this.isDrawing) {
            const pos = this.getMousePos(e);
            this.drawSpray(pos.x, pos.y);
        }
    }

    /**
     * Flood fill
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} color - Fill color
     */
    floodFill(x, y, color) {
        // Get image data
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;

        // Get target color (the color we're replacing)
        const startPos = (y * this.canvas.width + x) * 4;
        const targetR = pixels[startPos];
        const targetG = pixels[startPos + 1];
        const targetB = pixels[startPos + 2];
        const targetA = pixels[startPos + 3];

        // Convert fill color from hex to RGBA
        const fillColorRGBA = this.hexToRGBA(color);
        
        // Don't fill if the target color is the same as the fill color
        if (this.colorsMatch(
            [targetR, targetG, targetB, targetA],
            [fillColorRGBA.r, fillColorRGBA.g, fillColorRGBA.b, fillColorRGBA.a * 255]
        )) {
            return;
        }

        // Stack for flood fill
        const stack = [[x, y]];
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

    /**
     * Check if two colors match
     * @param {Array<number>} color1 - Color 1
     * @param {Array<number>} color2 - Color 2
     * @param {number} tolerance - Tolerance
     * @returns {boolean} Whether the colors match
     */
    colorsMatch(color1, color2, tolerance = 1) {
        return Math.abs(color1[0] - color2[0]) <= tolerance &&
               Math.abs(color1[1] - color2[1]) <= tolerance &&
               Math.abs(color1[2] - color2[2]) <= tolerance &&
               Math.abs(color1[3] - color2[3]) <= tolerance;
    }

    /**
     * Convert hex color to RGBA
     * @param {string} hex - Hex color
     * @returns {Object} RGBA color
     */
    hexToRGBA(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b, a: 1 };
    }

    /**
     * Update the color
     * @param {string} color - Color
     */
    updateColor(color) {
        this.currentColor = color;
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
    }

    /**
     * Add recent color
     * @param {string} color - Color
     */
    addRecentColor(color) {
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

    /**
     * Render recent colors
     */
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
                this.currentColor = color;
                this.colorPicker.color.hexString = color;
                this.updateColor(color);
                this.updateColorPreview(color);
            });
            
            recentColorsContainer.appendChild(colorBtn);
        });
    }

    /**
     * Update color preview
     * @param {string} color - Color
     */
    updateColorPreview(color) {
        const preview = document.getElementById('color-preview');
        if (preview) {
            preview.style.backgroundColor = color;
        }
    }

    /**
     * Start color picking
     */
    startColorPicking() {
        this.isPickingColor = true;
        this.canvas.style.cursor = 'crosshair';
        if (this.eyedropperBtn) {
            this.eyedropperBtn.classList.add('active');
        }
    }

    /**
     * Pick a color
     * @param {MouseEvent} e - Mouse event
     */
    pickColor(e) {
        const pos = this.getMousePos(e);
        const pixel = this.ctx.getImageData(pos.x, pos.y, 1, 1).data;
        
        // If pixel is transparent (alpha = 0), use white
        const color = pixel[3] === 0 ? '#FFFFFF' : 
            `#${[pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('')}`;
        
        this.currentColor = color;
        this.colorPicker.color.hexString = color;
        this.updateColor(color);
        this.updateColorPreview(color);
        this.addRecentColor(color);
        this.stopColorPicking();
    }

    /**
     * Stop color picking
     */
    stopColorPicking() {
        this.isPickingColor = false;
        this.canvas.style.cursor = 'crosshair';
        if (this.eyedropperBtn) {
            this.eyedropperBtn.classList.remove('active');
        }
    }

    /**
     * Show color preview
     * @param {MouseEvent} e - Mouse event
     */
    showColorPreview(e) {
        const pos = this.getMousePos(e);
        const pixel = this.ctx.getImageData(pos.x, pos.y, 1, 1).data;
        
        // If pixel is transparent (alpha = 0), use white
        const color = pixel[3] === 0 ? '#FFFFFF' : 
            `#${[pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('')}`;
        
        // Only preview the color
        if (this.colorPicker) {
            this.colorPicker.color.hexString = color;
        }
    }

    /**
     * Handle triangle type change
     * @param {Event} e - Event
     */
    handleTriangleTypeChange(e) {
        this.triangleType = e.target.value;
    }

    /**
     * Toggle transparency
     */
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

    /**
     * Handle touch start event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseDown(mouseEvent);
    }

    /**
     * Handle touch move event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseMove(mouseEvent);
    }

    /**
     * Handle touch end event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchEnd(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        this.handleMouseUp(mouseEvent);
    }

    /**
     * Calculate distance
     * @param {Object} point1 - Point 1
     * @param {Object} point2 - Point 2
     * @returns {Object} Distance metrics
     */
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

    /**
     * Show save modal
     */
    showSaveModal() {
        this.saveManager.showSaveModal();
    }

    /**
     * Hide save modal
     */
    hideSaveModal() {
        this.saveManager.hideSaveModal();
    }

    /**
     * Clear canvas
     */
    clearCanvas() {
        // Clear the entire drawing canvas by setting all pixels to transparent
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const canvasSettingsModal = document.getElementById('canvasSettingsModal');
    const startPaintBarBtn = document.getElementById('startPaintBarBtn');
    const responsiveCanvas = document.getElementById('responsiveCanvas');
    const responsiveLimits = document.getElementById('responsiveLimits');
    const widthInput = document.getElementById('canvasWidth');
    const heightInput = document.getElementById('canvasHeight');
    
    let isSquareLocked = false;
    
    // Show/hide responsive limits based on checkbox
    responsiveCanvas.addEventListener('change', () => {
        responsiveLimits.style.display = responsiveCanvas.checked ? 'block' : 'none';
        validateCanvasSettings();
    });
    
    // Handle square locking
    const updateSquareLock = () => {
        const width = parseInt(widthInput.value, 10);
        const height = parseInt(heightInput.value, 10);
        
        if (width === height && !isSquareLocked) {
            isSquareLocked = true;
            widthInput.dataset.squareLocked = 'true';
            heightInput.dataset.squareLocked = 'true';
        } else if (width !== height && isSquareLocked) {
            isSquareLocked = false;
            delete widthInput.dataset.squareLocked;
            delete heightInput.dataset.squareLocked;
        }
    };
    
    // Maintain square dimensions when locked
    const handleDimensionChange = (changedInput, otherInput) => {
        if (isSquareLocked) {
            otherInput.value = changedInput.value;
        }
        updateSquareLock();
        validateCanvasSettings();
    };
    
    // Add input event listeners for width/height
    widthInput.addEventListener('input', () => handleDimensionChange(widthInput, heightInput));
    heightInput.addEventListener('input', () => handleDimensionChange(heightInput, widthInput));
    
    // Validate canvas settings and show warnings if needed
    const validateCanvasSettings = () => {
        const width = parseInt(widthInput.value, 10);
        const height = parseInt(heightInput.value, 10);
        const isResponsive = responsiveCanvas.checked;
        const minDimension = 250;
        
        // Show warning if fill tool will be disabled
        const warningElement = document.getElementById('fillToolWarning') || (() => {
            const warning = document.createElement('div');
            warning.id = 'fillToolWarning';
            warning.style.color = '#FFFFFF';
            warning.style.marginTop = '12px';
            warning.style.fontSize = '14px';
            document.querySelector('.modal-body').appendChild(warning);
            return warning;
        })();
        
        let warnings = [];
        
        if ((width < minDimension || height < minDimension) && !isResponsive) {
            warnings.push('Fill tool will be disabled due to small canvas size.');
        }
        
        if (isSquareLocked) {
            warnings.push('Canvas is locked to square dimensions.');
        }
        
        warningElement.textContent = warnings.length ? 'Note: ' + warnings.join(' ') : '';
    };
    
    // Run initial validation and square lock check
    updateSquareLock();
    validateCanvasSettings();
    
    // Initialize PaintBar when settings are confirmed
    startPaintBarBtn.addEventListener('click', () => {
        const options = {
            width: parseInt(widthInput.value, 10),
            height: parseInt(heightInput.value, 10),
            responsive: responsiveCanvas.checked,
            minWidth: parseInt(document.getElementById('minWidth').value, 10),
            minHeight: parseInt(document.getElementById('minHeight').value, 10),
            maxWidth: parseInt(document.getElementById('maxWidth').value, 10),
            maxHeight: parseInt(document.getElementById('maxHeight').value, 10),
            isSquare: isSquareLocked
        };
        
        // Hide modal
        canvasSettingsModal.classList.add('hidden');
        
        // Update copyright year
        document.getElementById('currentYear').textContent = new Date().getFullYear();
        
        // Initialize PaintBar with settings
        const paintBar = new PaintBar(options);
        
        // Disable fill tool if canvas is too small and not responsive
        if ((options.width < 250 || options.height < 250) && !options.responsive) {
            const fillBtn = document.getElementById('fillBtn');
            if (fillBtn) {
                fillBtn.disabled = true;
                fillBtn.title = 'Fill tool disabled: Canvas too small';
                fillBtn.style.opacity = '0.5';
                fillBtn.style.cursor = 'not-allowed';
            }
        }
    });
});
