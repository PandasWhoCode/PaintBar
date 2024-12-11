class MobilePaint {
    constructor() {
        // Initialize properties
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.activeTool = 'pencil';
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

        // Initialize the application
        this.initializeState();
        this.initializeElements();
        this.initializeCanvas();
        this.setupEventListeners();
        
        // Debug logging
        console.log('Initial tool:', this.activeTool);
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
        this.saveBtn = document.getElementById('saveBtn');
        
        // Initialize modals and their elements
        this.textModal = document.getElementById('textModal');
        this.textInput = document.getElementById('textInput');
        this.textPreviewBtn = document.getElementById('previewTextBtn');
        this.acceptTextBtn = document.getElementById('acceptTextBtn');
        this.cancelTextBtn = document.getElementById('cancelTextBtn');
        this.closeTextBtn = document.getElementById('closeTextBtn');
        
        this.saveModal = document.getElementById('saveModal');
        this.closeSaveBtn = document.getElementById('closeSaveBtn');
        this.savePngBtn = document.getElementById('savePng');
        this.saveJpgBtn = document.getElementById('saveJpg');
        this.saveIcoBtn = document.getElementById('saveIco');
        this.cancelSaveBtn = document.getElementById('cancelSave');

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
            if (this.activeTool === 'text') {
                this.canvas.style.cursor = 'text';
                this.textBtn.classList.add('active');
            }
        });

        // Fix fill tool
        this.fillBtn = document.getElementById('fillBtn');
        this.fillBtn.addEventListener('click', () => {
            this.activeTool = 'fill';
            this.updateActiveButton(this.fillBtn);
        });
    }

    toggleToolbar() {
        if (!this.toolbar) return;
        
        this.toolbar.classList.toggle('visible');
        if (this.toolbarToggle) {
            this.toolbarToggle.classList.toggle('active');
        }
        
        // Update canvas container margin
        if (this.canvasContainer) {
            this.canvasContainer.classList.toggle('toolbar-visible');
        }
    }

    initializeCanvas() {
        if (!this.canvas) {
            console.error('Canvas not found');
            return;
        }

        // Get canvas context with willReadFrequently for better performance
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!this.ctx) {
            console.error('Could not get canvas context');
            return;
        }

        // Set canvas size
        this.canvas.width = this.defaultWidth;
        this.canvas.height = this.defaultHeight;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set initial background based on transparency
        if (!this.isTransparent) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvas.classList.add('opaque');
            this.canvas.classList.remove('transparent');
        } else {
            this.canvas.classList.add('transparent');
            this.canvas.classList.remove('opaque');
        }
        
        // Set default styles
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize.value;

        // Save initial state
        this.saveState();
    }

    calculateLineWidth(value) {
        // Convert slider value (1-100) to exponential line width
        // This gives finer control over smaller widths and smoother progression to larger widths
        const minWidth = 1;
        const maxWidth = 100;
        const factor = Math.log(maxWidth);
        return Math.round(Math.exp(factor * (value / 100)) * minWidth);
    }

    setupCanvas() {
        const width = parseInt(this.canvasWidth?.value) || this.defaultWidth;
        const height = parseInt(this.canvasHeight?.value) || this.defaultHeight;
        
        // Update main canvas
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Clear with transparency or white
        this.ctx.clearRect(0, 0, width, height);
        if (!this.isTransparent) {
            this.canvas.classList.add('opaque');
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, width, height);
        } else {
            this.canvas.classList.remove('opaque');
        }
        
        this.restoreDrawingState();
        this.saveState();
    }

    restoreDrawingState() {
        this.ctx.strokeStyle = this.colorPicker.value;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Enable image smoothing
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

        // Brush size event
        if (this.brushSize) {
            this.brushSize.addEventListener('input', (e) => {
                this.lineWidth = this.calculateLineWidth(e.target.value);
                this.ctx.lineWidth = this.lineWidth;
                if (this.brushSizeLabel) {
                    this.brushSizeLabel.textContent = `${e.target.value}px`;
                }
            });
        }

        // Text tool events
        if (this.previewTextBtn) {
            this.previewTextBtn.addEventListener('click', () => this.previewText());
        }
        if (this.acceptTextBtn) {
            this.acceptTextBtn.addEventListener('click', () => this.acceptText());
        }
        if (this.editTextBtn) {
            this.editTextBtn.addEventListener('click', () => this.editText());
        }
        if (this.cancelTextBtn) {
            this.cancelTextBtn.addEventListener('click', () => this.cancelText());
        }
        if (this.closeTextBtn) {
            this.closeTextBtn.addEventListener('click', () => {
                if (this.textModal) {
                    this.textModal.classList.add('hidden');
                }
                this.resetTextState();
            });
        }

        // Tool button events
        const toolButtons = {
            pencilBtn: 'pencil',
            eraserBtn: 'eraser',
            fillBtn: 'fill',
            textBtn: 'text',
            rectangleBtn: 'rectangle',
            circleBtn: 'circle',
            lineBtn: 'line',
            triangleBtn: 'triangle',
            selectBtn: 'select'
        };

        Object.entries(toolButtons).forEach(([btnId, toolName]) => {
            const button = document.getElementById(btnId);
            if (button) {
                button.addEventListener('click', () => {
                    this.setActiveTool(toolName);
                    // Hide all tool options first
                    document.querySelectorAll('.tool-options').forEach(opt => opt.classList.add('hidden'));
                    // Show specific tool options if needed
                    if (toolName === 'triangle') {
                        const triangleOptions = document.getElementById('triangle-type');
                        if (triangleOptions) {
                            triangleOptions.classList.remove('hidden');
                        }
                    }
                });
            }
        });

        // Action button events
        const actionButtons = {
            cropBtn: () => this.cropCanvas(),
            pasteBtn: () => this.pasteContent(),
            clearBtn: () => this.clearCanvas(),
            downloadBtn: () => this.showDownloadOptions()
        };

        Object.entries(actionButtons).forEach(([btnId, handler]) => {
            const button = document.getElementById(btnId);
            if (button) {
                button.addEventListener('click', handler.bind(this));  
            }
        });

        // Download format buttons
        ['Png', 'Jpg', 'Ico'].forEach(format => {
            const btn = document.getElementById(`download${format}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.downloadImage(format.toLowerCase());
                    // Close dropdown after selection
                    const dropdown = document.querySelector('.dropdown-content');
                    if (dropdown) {
                        dropdown.classList.remove('active');
                    }
                });
            }
        });

        // Save modal event listeners
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.showSaveModal());
        }
        if (this.closeSaveBtn) {
            this.closeSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        if (this.cancelSaveBtn) {
            this.cancelSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        if (this.savePngBtn) {
            this.savePngBtn.addEventListener('click', () => {
                this.saveImage('png');
                this.hideSaveModal();
            });
        }
        if (this.saveJpgBtn) {
            this.saveJpgBtn.addEventListener('click', () => {
                this.saveImage('jpg');
                this.hideSaveModal();
            });
        }
        if (this.saveIcoBtn) {
            this.saveIcoBtn.addEventListener('click', () => {
                this.saveImage('ico');
                this.hideSaveModal();
            });
        }

        // Canvas settings events
        const settingsBtn = document.getElementById('canvasSettingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const cancelSettingsBtn = document.getElementById('cancelCanvasSettings');
        const applySettingsBtn = document.getElementById('applyCanvasSettings');

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.classList.remove('hidden');
            });
        }

        if (closeSettingsBtn && settingsModal) {
            closeSettingsBtn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
            });
        }

        if (cancelSettingsBtn && settingsModal) {
            cancelSettingsBtn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
            });
        }

        if (applySettingsBtn) {
            applySettingsBtn.addEventListener('click', () => {
                this.applyCanvasSettings();
                settingsModal.classList.add('hidden');
            });
        }

        // File menu events
        const fileBtn = document.getElementById('fileBtn');
        const fileSubmenu = document.getElementById('fileSubmenu');
        const saveMenuItem = document.getElementById('saveMenuItem');

        if (fileBtn && fileSubmenu) {
            fileBtn.addEventListener('click', () => {
                fileSubmenu.classList.toggle('show');
            });
        }

        if (saveMenuItem) {
            saveMenuItem.addEventListener('click', () => {
                this.showSaveModal();
                // Hide the file submenu after clicking save
                if (fileSubmenu) {
                    fileSubmenu.classList.remove('show');
                }
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.querySelector('.dropdown-content.active');
            if (dropdown && !dropdown.contains(e.target) && !e.target.matches('#downloadBtn')) {
                dropdown.classList.remove('active');
            }
        });

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
    }

    setActiveTool(tool) {
        // Remove active class from all tool buttons
        const toolButtons = document.querySelectorAll('.submenu-content button');
        toolButtons.forEach(button => button.classList.remove('active'));

        // Add active class to the selected tool button
        const selectedButton = document.getElementById(`${tool}Btn`);
        if (selectedButton) {
            selectedButton.classList.add('active');
        }

        this.activeTool = tool;

        // Update cursor based on tool
        switch (tool) {
            case 'text':
                this.canvas.style.cursor = 'text';
                break;
            case 'eraser':
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'fill':
                this.canvas.style.cursor = 'crosshair';
                break;
            default:
                this.canvas.style.cursor = 'default';
        }

        console.log('Active tool set to:', tool);
    }

    handleMouseDown(e) {
        this.isDrawing = true;
        const point = this.getEventPoint(e);
        this.startX = point.x;
        this.startY = point.y;
        this.lastX = point.x;
        this.lastY = point.y;

        // Save the current canvas state for shape drawing
        if (['rectangle', 'circle', 'line', 'triangle'].includes(this.activeTool)) {
            this.saveState();
        }
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

    handleMouseMove(e) {
        if (this.isDrawing && this.activeTool !== 'text') {
            e.preventDefault();
            requestAnimationFrame(() => this.draw(e));
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.isDrawing && this.activeTool !== 'text') {
            requestAnimationFrame(() => this.handleTouch(e));
        }
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const { x, y } = this.getEventPoint(e);
        
        switch (this.activeTool) {
            case 'pencil':
                this.drawFreehand(x, y);
                break;
            case 'eraser':
                this.erase(x, y);
                break;
            case 'rectangle':
            case 'line':
                // Clear canvas and restore previous state
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                if (this.undoStack.length > 0) {
                    const lastState = this.undoStack[this.undoStack.length - 1];
                    this.ctx.drawImage(lastState, 0, 0);
                }
                this.drawShape(x, y);
                break;
            case 'circle':
                this.drawCircle(e);
                break;
            case 'triangle':
                this.drawTriangle(e);
                break;
        }
        
        this.lastX = x;
        this.lastY = y;
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

        if (!textInput || !fontSelect || !fontSizeInput || !textColor || !modal || !previewOverlay) {
            console.error('Text tool elements not found');
            return;
        }

        const text = textInput.value.trim();
        if (text === '') {
            return;
        }

        // Save current canvas state for undo
        const currentState = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.lastValidState = currentState;

        // Store text properties for later use
        this.textState = {
            text: text,
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

    applyText() {
        // Text is already drawn, just need to save state and clean up
        this.saveState();
        this.hideTextControls();
        this.resetTextState();
        this.lastValidState = null;
    }

    editText() {
        // Restore canvas to state before preview
        if (this.lastValidState) {
            this.ctx.putImageData(this.lastValidState, 0, 0);
        }

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
        if (this.lastValidState) {
            this.ctx.putImageData(this.lastValidState, 0, 0);
            this.lastValidState = null;
        }

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

    drawShape(x, y) {
        // Save current context state
        this.ctx.save();
        
        // Set drawing styles
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        
        // Begin the path
        this.ctx.beginPath();
        
        switch (this.activeTool) {
            case 'rectangle':
                const width = x - this.startX;
                const height = y - this.startY;
                if (this.fillShape) {
                    this.ctx.fillRect(this.startX, this.startY, width, height);
                }
                this.ctx.strokeRect(this.startX, this.startY, width, height);
                break;
                
            case 'line':
                this.ctx.moveTo(this.startX, this.startY);
                this.ctx.lineTo(x, y);
                this.ctx.stroke();
                break;
        }
        
        // Restore context state
        this.ctx.restore();
    }

    handleMouseUp(e) {
        if (!this.isDrawing) return;
        
        const { x, y } = this.getEventPoint(e);
        
        // For shape tools, draw the final shape
        if (['rectangle', 'circle', 'line', 'triangle'].includes(this.activeTool)) {
            switch (this.activeTool) {
                case 'rectangle':
                case 'line':
                    this.drawShape(x, y);
                    break;
                case 'circle':
                    this.drawCircle(e);
                    break;
                case 'triangle':
                    this.drawTriangle(e);
                    break;
            }
            this.saveState();
        }
        
        this.isDrawing = false;
    }

    drawCircle(e) {
        if (!this.isDrawing) return;
        
        const currentPoint = this.getEventPoint(e);
        
        // Calculate radius based on distance from center (start point)
        const dx = currentPoint.x - this.startX;
        const dy = currentPoint.y - this.startY;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        // Clear canvas and restore previous state
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.undoStack.length > 0) {
            const lastState = this.undoStack[this.undoStack.length - 1];
            this.ctx.drawImage(lastState, 0, 0);
        }
        
        // Draw the circle with center at start point
        this.ctx.beginPath();
        this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
        
        // Apply current stroke and fill settings
        this.ctx.save();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.fillStyle = this.currentColor;
        
        if (this.fillShape) {
            this.ctx.fill();
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawTriangle(e) {
        if (!this.isDrawing) return;
        
        const currentPoint = this.getEventPoint(e);
        
        // Clear canvas and restore previous state
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.undoStack.length > 0) {
            const lastState = this.undoStack[this.undoStack.length - 1];
            this.ctx.drawImage(lastState, 0, 0);
        }
        
        // Calculate base points based on triangle type
        let points;
        const dx = currentPoint.x - this.startX;
        const dy = currentPoint.y - this.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        switch (this.triangleType) {
            case 'equilateral':
                // 60-60-60 triangle
                points = [
                    { x: this.startX, y: this.startY }, // First point
                    { x: this.startX + distance * Math.cos(angle), y: this.startY + distance * Math.sin(angle) }, // Second point
                    { x: this.startX + distance * Math.cos(angle + Math.PI/3), y: this.startY + distance * Math.sin(angle + Math.PI/3) } // Third point
                ];
                break;
                
            case 'isosceles':
                // Base is equal to height, centered on drag direction
                const baseAngle = Math.PI/2; // 90 degrees perpendicular to height
                const baseHalfWidth = distance/2;
                
                // Calculate the base center point
                const baseCenterX = this.startX + distance * Math.cos(angle);
                const baseCenterY = this.startY + distance * Math.sin(angle);
                
                points = [
                    { x: this.startX, y: this.startY }, // Apex point
                    { 
                        x: baseCenterX + baseHalfWidth * Math.cos(angle + baseAngle),
                        y: baseCenterY + baseHalfWidth * Math.sin(angle + baseAngle)
                    }, // Base right point
                    { 
                        x: baseCenterX + baseHalfWidth * Math.cos(angle - baseAngle),
                        y: baseCenterY + baseHalfWidth * Math.sin(angle - baseAngle)
                    }  // Base left point
                ];
                break;
                
            case 'right':
                // 90-degree angle at start point
                points = [
                    { x: this.startX, y: this.startY }, // Right angle point
                    { x: this.startX, y: currentPoint.y }, // Second point
                    { x: currentPoint.x, y: currentPoint.y } // Third point
                ];
                break;
        }
        
        // Draw the triangle
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        this.ctx.lineTo(points[1].x, points[1].y);
        this.ctx.lineTo(points[2].x, points[2].y);
        this.ctx.closePath();
        
        // Apply current stroke and fill settings
        this.ctx.save();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.fillStyle = this.currentColor;
        
        if (this.fillShape) {
            this.ctx.fill();
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    erase(x, y) {
        const points = this.getPointsBetween(this.lastX, this.lastY, x, y);
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        points.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, this.lineWidth / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.closePath();
        });
        
        this.ctx.restore();
    }

    startDrawing(event) {
        if (this.activeTool === 'text') return;
        
        this.isDrawing = true;
        const pos = this.getEventPoint(event);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.startX = pos.x;  // Store start position for shapes
        this.startY = pos.y;
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

    getEventPoint(e) {
        let clientX, clientY;
        
        if (e.touches && e.touches[0]) {
            // Touch event
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            // Mouse event
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            // Save state after completing a drawing action
            this.saveState();
        }
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
        if (this.activeTool === 'fill') {
            this.floodFill(Math.round(pos.x), Math.round(pos.y), this.currentColor);
            this.saveState();
        } else if (this.activeTool === 'text') {
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

    applyCanvasSettings() {
        // Get new dimensions and transparency setting
        const newWidth = parseInt(document.getElementById('canvasWidth')?.value) || this.defaultWidth;
        const newHeight = parseInt(document.getElementById('canvasHeight')?.value) || this.defaultHeight;
        const transparentCanvas = document.getElementById('transparentCanvas')?.checked || false;
        
        // Create a temporary canvas to store current content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.canvas, 0, 0);

        // Store current transparency state
        const wasTransparent = this.isTransparent;
        this.isTransparent = transparentCanvas;

        // Update canvas dimensions if changed
        if (newWidth !== this.canvas.width || newHeight !== this.canvas.height) {
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
        }

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Handle transparency transition
        if (this.isTransparent && !wasTransparent) {
            // If switching to transparent, we need to remove the white background
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            
            // Make white pixels transparent
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
                    data[i + 3] = 0; // Set alpha to 0 for white pixels
                }
            }
            
            // Update the temporary canvas with transparent background
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.putImageData(imageData, 0, 0);
        } else if (!this.isTransparent) {
            // If switching to opaque or staying opaque, ensure white background
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // If dimensions changed, scale the content
        if (newWidth !== tempCanvas.width || newHeight !== tempCanvas.height) {
            const scale = Math.min(
                newWidth / tempCanvas.width,
                newHeight / tempCanvas.height
            );
            const scaledWidth = tempCanvas.width * scale;
            const scaledHeight = tempCanvas.height * scale;
            const x = (newWidth - scaledWidth) / 2;
            const y = (newHeight - scaledHeight) / 2;
            
            this.ctx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight);
        } else {
            this.ctx.drawImage(tempCanvas, 0, 0);
        }

        // Restore context settings
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Update canvas class for CSS styling
        if (this.isTransparent) {
            this.canvas.classList.add('transparent');
            this.canvas.classList.remove('opaque');
        } else {
            this.canvas.classList.add('opaque');
            this.canvas.classList.remove('transparent');
        }

        // Save the new state
        this.saveState();
    }

    downloadImage(format) {
        if (!this.canvas) return;

        // Create a temporary link element
        const link = document.createElement('a');
        
        // Set up the file name
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `paint-${timestamp}`;

        // Handle different formats
        switch (format.toLowerCase()) {
            case 'png':
                // For PNG, just use the canvas directly to preserve transparency
                link.download = `${fileName}.png`;
                link.href = this.canvas.toDataURL('image/png');
                break;

            case 'jpg':
                // Create a temporary canvas with white background for JPG
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.canvas.width;
                tempCanvas.height = this.canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Fill with white background
                tempCtx.fillStyle = 'white';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                
                // Draw the original canvas content
                tempCtx.drawImage(this.canvas, 0, 0);
                
                link.download = `${fileName}.jpg`;
                link.href = tempCanvas.toDataURL('image/jpeg', 0.9);
                break;

            case 'ico':
                // Create multiple ICO sizes
                const sizes = [16, 32, 64, 128, 256];
                const icoCanvases = sizes.map(size => {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    
                    // Enable high-quality scaling
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // Draw and scale the original canvas
                    ctx.drawImage(this.canvas, 0, 0, size, size);
                    
                    return canvas.toDataURL('image/png');
                });

                // For now, we'll just download the 256x256 version
                // TODO: Implement server-side 7z compression for multiple sizes
                link.download = `${fileName}-256.ico`;
                link.href = icoCanvases[icoCanvases.length - 1];
                break;

            default:
                console.error('Unsupported format:', format);
                return;
        }

        // Trigger the download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    clearCanvas() {
        if (!this.ctx || !this.canvas) return;
        
        // Save current state before clearing
        this.saveState();
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // If not transparent, fill with white
        if (!this.isTransparent) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Save the cleared state
        this.saveState();
    }

    cropCanvas() {
        // TODO: Implement crop functionality
        console.log('Crop functionality not yet implemented');
    }

    pasteContent() {
        // TODO: Implement paste functionality
        console.log('Paste functionality not yet implemented');
    }

    showDownloadOptions() {
        const dropdown = document.querySelector('.dropdown-content');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    }

    showSaveModal() {
        if (this.saveModal) {
            this.saveModal.classList.remove('hidden');
        }
    }

    hideSaveModal() {
        if (this.saveModal) {
            this.saveModal.classList.add('hidden');
        }
    }

    saveImage(format) {
        let filename = `paint-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`;
        let mimeType;
        
        switch (format) {
            case 'png':
                filename += '.png';
                mimeType = 'image/png';
                break;
            case 'jpg':
                filename += '.jpg';
                mimeType = 'image/jpeg';
                break;
            case 'ico':
                filename += '.ico';
                mimeType = 'image/x-icon';
                break;
            default:
                filename += '.png';
                mimeType = 'image/png';
        }

        // Create a temporary canvas to handle transparent background if needed
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // For JPG, fill with white background since it doesn't support transparency
        if (format === 'jpg') {
            tempCtx.fillStyle = '#FFFFFF';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        }

        // Draw the original canvas content
        tempCtx.drawImage(this.canvas, 0, 0);

        // Convert to blob and download
        tempCanvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.hideSaveModal();
            }
        }, mimeType);
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
        this.canvas.style.cursor = 'default';
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
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const mobilePaint = new MobilePaint();
});
