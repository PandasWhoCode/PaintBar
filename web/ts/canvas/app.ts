/**
 * PaintBar - A modern web-based drawing application
 * Features include:
 * - Multiple drawing tools (pencil, shapes, eraser)
 * - Color management with recent colors
 * - Canvas state management (undo/redo)
 * - Touch device support
 * - Transparency support
 */

import { SaveManager } from "./save";
import { ProjectManager } from "./project";
import { ToolManager } from "./toolManager";
import { CanvasManager } from "./canvasManager";
import { auth, onAuthStateChanged } from "../shared/firebase-init";
import "../shared/errors";
import type { Point, TriangleType, CanvasOptions, RGBA } from "../shared/types";

// iro is loaded via CDN <script> tag — see iro.d.ts for type declarations

/**
 * PaintBar class representing the drawing application
 */
export class PaintBar {
  // Canvas layers
  transparentBgCanvas: HTMLCanvasElement;
  transparentBgCtx: CanvasRenderingContext2D;
  opaqueBgCanvas: HTMLCanvasElement;
  opaqueBgCtx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  overlayCanvas: HTMLCanvasElement;
  overlayCtx: CanvasRenderingContext2D;

  // Dimensions
  isSquare: boolean;
  canvasWidth: number;
  canvasHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  defaultWidth: number;
  defaultHeight: number;

  // Drawing state
  isDrawing: boolean;
  currentColor: string;
  lineWidth: number;
  fillShape: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  isTransparent: boolean;

  // Color management
  recentColors: string[];
  maxRecentColors: number;
  isPickingColor: boolean;

  // Shape properties
  triangleType: TriangleType;

  // State management
  undoStack: ImageData[];
  redoStack: ImageData[];
  maxUndoStates: number;

  // Managers
  toolManager: ToolManager;
  saveManager: SaveManager;
  projectManager: ProjectManager;
  canvasManager: CanvasManager;

  // UI elements
  private toolbar: HTMLElement | null;
  private toolbarToggle: HTMLElement | null;
  private toolbarHandle: HTMLElement | null;
  private canvasContainer: HTMLElement | null;
  private colorButtons: NodeListOf<HTMLElement>;
  // colorPreview is looked up by ID in updateColorPreview()
  private eyedropperBtn: HTMLElement | null;
  private colorPicker: iro.ColorPicker;
  private brushSize: HTMLInputElement | null;
  private brushSizeLabel: HTMLElement | null;

  // Selection state (used by handleMouseUp)
  private isSelecting: boolean;
  private selectionStart: Point | null;
  private selectionEnd: Point | null;
  private selectedArea: {
    x: number;
    y: number;
    width: number;
    height: number;
    backgroundState?: ImageData;
  } | null;
  private selectionImageData: ImageData | null;

  // Throttle utility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private throttle: <T extends (...args: any[]) => void>(
    func: T,
    limit: number,
  ) => T;
  private throttledMouseMove: (e: MouseEvent) => void;

  constructor(options: Partial<CanvasOptions> = {}) {
    // Initialize canvas layers
    this.transparentBgCanvas = document.getElementById(
      "transparentBackgroundCanvas",
    ) as HTMLCanvasElement;
    this.transparentBgCtx = this.transparentBgCanvas.getContext("2d")!;

    this.opaqueBgCanvas = document.getElementById(
      "opaqueBackgroundCanvas",
    ) as HTMLCanvasElement;
    this.opaqueBgCtx = this.opaqueBgCanvas.getContext("2d")!;

    this.canvas = document.getElementById("drawingCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;

    this.overlayCanvas = document.getElementById(
      "selectionOverlay",
    ) as HTMLCanvasElement;
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;

    // Store square state
    this.isSquare = options.isSquare || false;

    if (this.isSquare) {
      const size = Math.min(options.width || 800, options.height || 600);
      options.width = size;
      options.height = size;
    }

    // Initialize dimensions
    this.canvasWidth = options.width || 800;
    this.canvasHeight = options.height || 600;
    this.minWidth = options.minWidth || 300;
    this.minHeight = options.minHeight || 200;
    this.maxWidth = options.maxWidth || 4096;
    this.maxHeight = options.maxHeight || 4096;

    if (this.isSquare) {
      const minSize = Math.max(this.minWidth, this.minHeight);
      const maxSize = Math.min(this.maxWidth, this.maxHeight);
      this.minWidth = this.minHeight = minSize;
      this.maxWidth = this.maxHeight = maxSize;
    }

    // Drawing state
    this.isDrawing = false;
    this.currentColor = "#000000";
    this.lineWidth = 5;
    this.fillShape = false;
    this.startX = 0;
    this.startY = 0;
    this.lastX = 0;
    this.lastY = 0;

    // Canvas properties
    this.defaultWidth = options.width || 800;
    this.defaultHeight = options.height || 600;
    this.isTransparent = false;

    // Color management
    this.recentColors = ["#000000"];
    this.maxRecentColors = 10;
    this.isPickingColor = false;

    // Shape properties
    this.triangleType = "equilateral";

    // State management
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoStates = 20;

    // Selection state
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectedArea = null;
    this.selectionImageData = null;

    // Throttle utility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.throttle = <T extends (...args: any[]) => void>(
      func: T,
      limit: number,
    ): T => {
      let inThrottle: boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function (this: any, ...args: any[]) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => (inThrottle = false), limit);
        }
      } as T;
    };
    this.throttledMouseMove = this.throttle(
      (e: MouseEvent) => this.handleMouseMove(e),
      16,
    );

    // Initialize managers
    this.toolManager = new ToolManager(this);
    this.saveManager = new SaveManager(this);
    this.projectManager = new ProjectManager(this);
    this.canvasManager = new CanvasManager(this, {
      width: this.defaultWidth,
      height: this.defaultHeight,
      responsive: options.responsive,
      minWidth: this.minWidth,
      minHeight: this.minHeight,
      maxWidth: this.maxWidth,
      maxHeight: this.maxHeight,
    });

    // Initialize UI elements (needs to happen before other init)
    this.toolbar = null;
    this.toolbarToggle = null;
    this.toolbarHandle = null;
    this.canvasContainer = null;
    this.colorButtons = document.querySelectorAll(".color-btn");
    this.eyedropperBtn = null;
    this.brushSize = null;
    this.brushSizeLabel = null;

    // Placeholder — will be initialized in initializeElements
    this.colorPicker = null!;

    // Set up the application
    this.initializeState();
    this.initializeElements();
    this.initializeUI();
    this.addRecentColor(this.currentColor);
    this.initializeCanvas();
    this.setupEventListeners();
  }

  /**
   * Initialize the canvas state
   */
  private initializeState(): void {
    this.canvas.width = this.defaultWidth;
    this.canvas.height = this.defaultHeight;

    this.ctx.strokeStyle = "#000000";
    this.ctx.fillStyle = "#000000";
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  /**
   * Initialize the UI elements
   */
  private initializeElements(): void {
    this.canvas = document.getElementById("drawingCanvas") as HTMLCanvasElement;
    if (!this.canvas) {
      console.error("Canvas not found");
      return;
    }

    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    if (!this.ctx) {
      console.error("Could not get canvas context");
      return;
    }

    // Toolbar elements
    this.toolbar = document.getElementById("toolbar");
    this.toolbarToggle = document.getElementById("toolbarToggle");
    this.toolbarHandle = document.getElementById("toolbarHandle");
    this.canvasContainer = document.querySelector(".canvas-container");

    // Color elements
    this.colorButtons = document.querySelectorAll(".color-btn");
    // colorPreview looked up by ID in updateColorPreview()
    this.eyedropperBtn = document.getElementById("eyedropperBtn");
    this.recentColors = [];
    this.maxRecentColors = 10;
    this.isPickingColor = false;

    // Color picker
    this.colorPicker = new iro.ColorPicker("#color-picker", {
      width: 100,
      color: this.currentColor,
      layout: [
        {
          component: iro.ui.Wheel,
          options: {},
        },
        {
          component: iro.ui.Slider,
          options: {
            sliderType: "value",
            width: 120,
            height: 36,
          },
        },
        {
          component: iro.ui.Box,
          options: {
            width: 120,
            height: 36,
          },
        },
      ],
      display: "inline-block",
    });

    this.currentColor = "#000000";
    this.updateColorPreview(this.currentColor);

    this.colorPicker.on("color:change", (color) => {
      this.currentColor = color.hexString;
      this.updateColorPreview(this.currentColor);

      const hexInput = document.getElementById(
        "hexInput",
      ) as HTMLInputElement | null;
      if (hexInput) {
        hexInput.value = color.hexString;
      }
    });

    const colorPickerEl = document.getElementById("color-picker");
    if (colorPickerEl) {
      colorPickerEl.addEventListener("mouseup", () => {
        this.addRecentColor(this.currentColor);
      });
      colorPickerEl.addEventListener("touchend", () => {
        this.addRecentColor(this.currentColor);
      });
    }

    // Hex input
    const hexInput = document.getElementById(
      "hexInput",
    ) as HTMLInputElement | null;
    if (hexInput) {
      hexInput.value = this.currentColor;

      hexInput.addEventListener("input", (e) => {
        let value = (e.target as HTMLInputElement).value;

        if (value[0] !== "#") {
          value = "#" + value;
          (e.target as HTMLInputElement).value = value;
        }

        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          this.currentColor = value;
          this.colorPicker.color.hexString = value;
          this.updateColorPreview(value);
          this.updateColor(value);
          this.addRecentColor(value);
        }
      });

      hexInput.addEventListener("blur", (e) => {
        let value = (e.target as HTMLInputElement).value;

        if (value[0] !== "#") {
          value = "#" + value;
        }

        while (value.length < 7) {
          value += "0";
        }

        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          (e.target as HTMLInputElement).value = value;
          this.currentColor = value;
          this.colorPicker.color.hexString = value;
          this.updateColorPreview(value);
          this.updateColor(value);
        } else {
          (e.target as HTMLInputElement).value = this.currentColor;
        }
      });
    }

    // Brush size
    this.brushSize = document.getElementById(
      "brushSize",
    ) as HTMLInputElement | null;
    this.brushSizeLabel = document.getElementById("brushSizeLabel");

    if (this.brushSize && this.brushSizeLabel) {
      this.brushSize.value = "5";
      this.brushSizeLabel.textContent = this.brushSize.value;
    }
  }

  /**
   * Initialize UI elements and event listeners
   */
  private initializeUI(): void {
    const canvasSettingsBtn = document.getElementById("canvasSettingsBtn");
    if (canvasSettingsBtn) {
      canvasSettingsBtn.addEventListener("click", () => {
        const settingsModal = document.getElementById("settingsModal");
        if (settingsModal) {
          settingsModal.classList.remove("hidden");
        }
      });
    }

    if (document.getElementById("textBtn")) {
      document.getElementById("textBtn")!.addEventListener("click", () => {
        if (
          this.toolManager.activeTool ===
          (this.toolManager as unknown as { tools: Record<string, unknown> })
            .tools?.text
        ) {
          this.canvas.style.cursor = "text";
        }
      });
    }

    const fillBtn = document.getElementById("fillBtn");
    if (fillBtn) {
      fillBtn.addEventListener("click", () => {
        this.toolManager.setActiveTool("fill");
        this.updateActiveButton(fillBtn);
      });
    }
  }

  /**
   * Toggle toolbar visibility
   */
  private toggleToolbar(): void {
    if (!this.toolbarToggle || !this.toolbar || !this.canvasContainer) return;
    this.toolbarToggle.classList.toggle("active");
    this.toolbar.classList.toggle("expanded");
    this.canvasContainer.classList.toggle("toolbar-visible");

    this.toolbarToggle.style.transform = "translate3d(0px, 0px, 0)";
  }

  /**
   * Initialize the canvas
   */
  private initializeCanvas(): void {
    this.canvasManager.initializeCanvases();

    const wrapper = this.canvas.parentElement;
    if (wrapper) {
      wrapper.classList.toggle("transparent", this.isTransparent);
    }
  }

  /**
   * Draw a transparent background
   */
  drawTransparentBackground(): void {
    const size = 10;
    const ctx = this.transparentBgCtx;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(
      0,
      0,
      this.transparentBgCanvas.width,
      this.transparentBgCanvas.height,
    );

    ctx.fillStyle = "#e0e0e0";
    for (let i = 0; i < this.transparentBgCanvas.width; i += size * 2) {
      for (let j = 0; j < this.transparentBgCanvas.height; j += size * 2) {
        ctx.fillRect(i, j, size, size);
        ctx.fillRect(i + size, j + size, size, size);
      }
    }
  }

  /**
   * Calculate the line width based on the slider value
   */
  private calculateLineWidth(value: number): number {
    const minWidth = 1;
    const maxWidth = 100;
    const factor = Math.log(maxWidth);
    return Math.round(Math.exp(factor * (value / 100)) * minWidth);
  }

  /**
   * Set up event listeners for the application
   */
  private setupEventListeners(): void {
    this.initializeDrag();

    [this.canvas, this.overlayCanvas].forEach((canvas) => {
      canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
      canvas.addEventListener("mousemove", this.throttledMouseMove);
      canvas.addEventListener("mouseup", (e) => this.handleMouseUp(e));
      canvas.addEventListener("mouseleave", (e) => this.handleMouseUp(e));

      canvas.addEventListener("touchstart", (e) => this.handleTouchStart(e));
      canvas.addEventListener("touchmove", (e) => this.handleTouchMove(e));
      canvas.addEventListener("touchend", (e) => this.handleTouchEnd(e));
    });

    // Tool buttons
    const toolButtons: Record<string, string> = {
      pencil: "pencilBtn",
      eraser: "eraserBtn",
      fill: "fillBtn",
      text: "textBtn",
      select: "selectBtn",
      rectangle: "rectangleBtn",
      circle: "circleBtn",
      line: "lineBtn",
      triangle: "triangleBtn",
      arc: "arcBtn",
      spray: "sprayBtn",
    };

    Object.keys(toolButtons).forEach((tool) => {
      const button = document.getElementById(toolButtons[tool]);
      if (button) {
        button.addEventListener("click", () => {
          this.setActiveTool(tool);
          this.updateActiveButton(button);
        });
      }
    });

    // Brush size
    const brushSize = document.getElementById(
      "brushSize",
    ) as HTMLInputElement | null;
    const brushSizeLabel = document.getElementById("brushSizeLabel");

    if (brushSize) {
      brushSize.addEventListener("input", (e) => {
        this.lineWidth = this.calculateLineWidth(
          Number((e.target as HTMLInputElement).value),
        );
        this.ctx.lineWidth = this.lineWidth;
        if (brushSizeLabel) {
          brushSizeLabel.textContent = `${(e.target as HTMLInputElement).value}px`;
        }
      });
    }

    // Action buttons
    const actionButtons: Record<string, () => void> = {
      pasteBtn: () => this.pasteContent(),
      clearBtn: () => this.clearCanvas(),
      undoBtn: () => this.undo(),
      redoBtn: () => this.redo(),
    };

    Object.entries(actionButtons).forEach(([btnId, handler]) => {
      const button = document.getElementById(btnId);
      if (button) {
        button.addEventListener("click", handler);
      }
    });

    // Color buttons
    this.colorButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const color = (button as HTMLElement).dataset.color;
        if (color) {
          this.currentColor = color;
          this.colorPicker.color.hexString = color;
          this.updateColor(color);
          this.updateColorPreview(color);
        }
      });
    });

    // Eyedropper
    if (this.eyedropperBtn) {
      this.eyedropperBtn.addEventListener("click", () => {
        this.startColorPicking();
      });

      document.addEventListener("keydown", (e) => {
        if (
          e.key.toLowerCase() === "i" &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey
        ) {
          this.startColorPicking();
        }
        if (e.key === "Escape" && this.isPickingColor) {
          this.stopColorPicking();
        }
      });
    }

    // Canvas color picking
    if (this.canvas) {
      this.canvas.addEventListener("click", (e) => {
        if (this.isPickingColor) {
          this.pickColor(e);
        }
      });
      this.canvas.addEventListener("mousemove", (e) => {
        if (this.isPickingColor) {
          this.showColorPreview(e);
        }
      });
    }

    // Toolbar toggle
    if (this.toolbarToggle && this.toolbar) {
      this.toolbarToggle.addEventListener("click", () => this.toggleToolbar());
    }
    if (this.toolbarHandle && this.toolbar) {
      this.toolbarHandle.addEventListener("click", () => this.toggleToolbar());
    }

    // Auto-hide toolbar on mobile
    if (window.innerWidth <= 768 && this.canvas && this.toolbar) {
      this.canvas.addEventListener("click", () => {
        if (this.toolbar!.classList.contains("visible")) {
          this.toggleToolbar();
        }
      });
    }

    // Submenus
    const submenus = document.querySelectorAll(".submenu");
    submenus.forEach((submenu) => {
      const header = submenu.querySelector(".submenu-header");
      if (header) {
        header.addEventListener("click", (e) => {
          e.stopPropagation();
          submenu.classList.toggle("collapsed");
        });
      }
    });

    document.querySelectorAll(".submenu-header").forEach((header) => {
      header.addEventListener("click", () => {
        const content = header.nextElementSibling;
        const toggle = header.querySelector(".submenu-toggle");

        if (content) content.classList.toggle("expanded");
        if (toggle) toggle.classList.toggle("expanded");
      });
    });

    // Triangle type
    const triangleBtn = document.getElementById("triangleBtn");
    const triangleTypeSelect = document.getElementById(
      "triangle-type",
    ) as HTMLSelectElement | null;

    if (triangleBtn && triangleTypeSelect) {
      this.toolManager.onToolChange = (tool) => {
        const isTriangleTool = tool?.constructor.name === "TriangleTool";
        triangleTypeSelect.style.display = isTriangleTool ? "block" : "none";
      };

      triangleTypeSelect.addEventListener("change", (e) => {
        this.triangleType = (e.target as HTMLSelectElement)
          .value as TriangleType;
      });

      triangleTypeSelect.style.display = "none";
      this.triangleType = "equilateral";
      triangleTypeSelect.value = "equilateral";
    }

    // Transparency checkbox
    const transparentCanvas = document.getElementById(
      "transparentCanvas",
    ) as HTMLInputElement | null;
    if (transparentCanvas) {
      transparentCanvas.addEventListener("change", () => {
        if (this.isTransparent !== transparentCanvas.checked) {
          this.toggleTransparency();
        }
      });
    }

    // Mouse events on main canvas
    this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    this.canvas.addEventListener("mousemove", this.throttledMouseMove);
    this.canvas.addEventListener("mouseup", (e) => this.handleMouseUp(e));
    this.canvas.addEventListener("mouseout", (e) => this.handleMouseUp(e));

    // Clear button
    const clearBtn = document.getElementById("clearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => this.clearCanvas());
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        this.undo();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        e.shiftKey
      ) {
        e.preventDefault();
        this.redo();
      }
    });
  }

  /**
   * Initialize drag functionality for toolbar toggle
   */
  private initializeDrag(): void {
    if (!this.toolbarToggle) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    const getTransformOffset = (): { x: number; y: number } => {
      const transform = window.getComputedStyle(this.toolbarToggle!).transform;
      if (transform === "none") return { x: 0, y: 0 };

      const matrix = new DOMMatrix(transform);
      return { x: matrix.m41, y: matrix.m42 };
    };

    const dragStart = (e: MouseEvent | TouchEvent): void => {
      const currentTransform = getTransformOffset();
      xOffset = currentTransform.x;
      yOffset = currentTransform.y;

      if ("touches" in e) {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
      } else {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
      }

      if (e.target === this.toolbarToggle) {
        isDragging = true;
        this.toolbarToggle!.classList.add("dragging");
      }
    };

    const dragEnd = (): void => {
      if (!isDragging) return;

      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      this.toolbarToggle!.classList.remove("dragging");
    };

    const drag = (e: MouseEvent | TouchEvent): void => {
      if (!isDragging) return;

      e.preventDefault();

      if ("touches" in e) {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }

      xOffset = currentX;
      yOffset = currentY;

      const bounds = this.toolbarToggle!.getBoundingClientRect();
      const maxX = window.innerWidth - bounds.width;
      const maxY = window.innerHeight - bounds.height;

      currentX = Math.min(Math.max(currentX, 0), maxX);
      currentY = Math.min(Math.max(currentY, 0), maxY);

      this.toolbarToggle!.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    };

    this.toolbarToggle.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", dragEnd);

    this.toolbarToggle.addEventListener("touchstart", dragStart);
    document.addEventListener("touchmove", drag);
    document.addEventListener("touchend", dragEnd);
  }

  /**
   * Set the active tool
   */
  setActiveTool(tool: string): void {
    this.toolManager.setActiveTool(tool);
  }

  /**
   * Update the active button state in the toolbar
   */
  private updateActiveButton(activeButton: HTMLElement): void {
    const toolButtons = document.querySelectorAll(".tool-button");
    toolButtons.forEach((button) => button.classList.remove("active"));

    if (activeButton) {
      activeButton.classList.add("active");
    }
  }

  /**
   * Handle mouse down event
   */
  private handleMouseDown(e: MouseEvent): void {
    const pos = this.getMousePos(e);

    if (this.toolManager.activeTool) {
      const toolName = this.toolManager.activeTool.constructor.name
        .toLowerCase()
        .replace("tool", "");

      if (toolName !== "fill") {
        this.saveState();
      }

      if (!["fill", "text"].includes(toolName)) {
        this.isDrawing = true;
      }
    }

    this.startX = pos.x;
    this.startY = pos.y;
    this.lastX = pos.x;
    this.lastY = pos.y;

    this.toolManager.handleMouseDown(pos);
  }

  /**
   * Handle mouse move event
   */
  private handleMouseMove(e: MouseEvent): void {
    const point = this.getMousePos(e);
    if (this.isDrawing) {
      this.toolManager.handleMouseMove(point);
    }
  }

  /**
   * Handle mouse up event
   */
  private handleMouseUp(e: MouseEvent): void {
    if (!this.isDrawing) return;

    const point = this.getMousePos(e);
    const toolName =
      this.toolManager.activeTool?.constructor.name
        .toLowerCase()
        .replace("tool", "") || "";

    if (toolName === "select") {
      if (this.isSelecting) {
        this.isSelecting = false;
        this.selectionEnd = point;
        this.createSelectionFromPoints();
      }
    }

    this.toolManager.handleMouseUp(point);
    this.isDrawing = false;
  }

  /**
   * Get mouse position relative to canvas
   */
  private getMousePos(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  /**
   * Save the current state
   */
  saveState(): void {
    const state = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    this.undoStack.push(state);

    if (this.undoStack.length > this.maxUndoStates) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  /**
   * Restore the last saved state (undo)
   */
  private undo(): void {
    if (this.undoStack.length > 0) {
      const currentState = this.ctx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      );
      this.redoStack.push(currentState);

      const lastState = this.undoStack.pop()!;
      this.ctx.putImageData(lastState, 0, 0);
    }
  }

  /**
   * Restore the last undone state (redo)
   */
  private redo(): void {
    if (this.redoStack.length > 0) {
      const nextState = this.redoStack.pop()!;
      this.ctx.putImageData(nextState, 0, 0);
      this.undoStack.push(nextState);
    }
  }

  /**
   * Handle touch start event
   */
  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    this.handleMouseDown(mouseEvent);
  }

  /**
   * Handle touch move event
   */
  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    this.handleMouseMove(mouseEvent);
  }

  /**
   * Handle touch end event
   */
  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    const mouseEvent = new MouseEvent("mouseup", {});
    this.handleMouseUp(mouseEvent);
  }

  /**
   * Apply canvas style
   */
  /* @internal — used by legacy shape drawing path */
  private applyCanvasStyle(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = this.currentColor;
    ctx.lineWidth = this.lineWidth;
    ctx.fillStyle = this.currentColor;
  }

  /**
   * Draw a shape from points
   */
  /* @internal — used by legacy shape drawing path */
  private drawShape(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    shouldFill = false,
  ): void {
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
   */
  /* @internal — used by legacy shape drawing path */
  private drawCircleShape(
    ctx: CanvasRenderingContext2D,
    center: Point,
    radius: number,
    shouldFill = false,
  ): void {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    if (shouldFill) {
      ctx.fill();
    }
    ctx.stroke();
  }

  /**
   * Calculate distance between two points
   */
  /* @internal — used by legacy shape drawing path */
  private calculateDistance(
    point1: Point,
    point2: Point,
  ): { dx: number; dy: number; distance: number; angle: number } {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return {
      dx,
      dy,
      distance: Math.sqrt(dx * dx + dy * dy),
      angle: Math.atan2(dy, dx),
    };
  }

  /**
   * Move the selection
   */
  /* @internal — selection move will be wired up in Phase 9 */
  private moveSelection(dx: number, dy: number): void {
    if (!this.selectedArea || !this.selectionImageData) return;

    const newX = Math.max(
      0,
      Math.min(
        this.canvas.width - this.selectedArea.width,
        this.selectedArea.x + dx,
      ),
    );
    const newY = Math.max(
      0,
      Math.min(
        this.canvas.height - this.selectedArea.height,
        this.selectedArea.y + dy,
      ),
    );

    if (newX === this.selectedArea.x && newY === this.selectedArea.y) return;

    if (this.selectedArea.backgroundState) {
      this.ctx.putImageData(this.selectedArea.backgroundState, 0, 0);
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.selectedArea.width;
    tempCanvas.height = this.selectedArea.height;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(this.selectionImageData, 0, 0);

    this.ctx.save();
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.fillStyle = "rgba(0,0,0,1)";
    this.ctx.fillRect(
      newX,
      newY,
      this.selectedArea.width,
      this.selectedArea.height,
    );
    this.ctx.restore();

    this.ctx.drawImage(tempCanvas, newX, newY);

    this.selectedArea.x = newX;
    this.selectedArea.y = newY;
    this.selectionStart = { x: newX, y: newY };
    this.selectionEnd = {
      x: newX + this.selectedArea.width,
      y: newY + this.selectedArea.height,
    };

    this.drawSelectionOverlay();
    tempCanvas.remove();
  }

  /**
   * Draw selection overlay (stub — used by moveSelection)
   */
  private drawSelectionOverlay(): void {
    if (!this.selectionStart || !this.selectionEnd) return;
    const overlayCtx = this.overlayCtx;
    overlayCtx.clearRect(
      0,
      0,
      overlayCtx.canvas.width,
      overlayCtx.canvas.height,
    );

    const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);

    overlayCtx.strokeStyle = "#00f";
    overlayCtx.lineWidth = 1;
    overlayCtx.setLineDash([5, 5]);
    overlayCtx.strokeRect(x, y, width, height);
    overlayCtx.setLineDash([]);
  }

  /**
   * Create selection from start/end points (stub — used by handleMouseUp)
   */
  private createSelectionFromPoints(): void {
    if (!this.selectionStart || !this.selectionEnd) return;
    const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);

    this.selectedArea = { x, y, width, height };
    this.selectionImageData = this.ctx.getImageData(x, y, width, height);
  }

  /**
   * Flood fill
   */
  /* @internal — legacy flood fill kept for direct-call path */
  private floodFill(x: number, y: number, color: string): void {
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    const pixels = imageData.data;

    const startPos = (y * this.canvas.width + x) * 4;
    const targetR = pixels[startPos];
    const targetG = pixels[startPos + 1];
    const targetB = pixels[startPos + 2];
    const targetA = pixels[startPos + 3];

    const fillColorRGBA = this.hexToRGBA(color);

    if (
      this.colorsMatch(
        [targetR, targetG, targetB, targetA],
        [
          fillColorRGBA.r,
          fillColorRGBA.g,
          fillColorRGBA.b,
          fillColorRGBA.a * 255,
        ],
      )
    ) {
      return;
    }

    const stack: [number, number][] = [[x, y]];
    const width = this.canvas.width;
    const height = this.canvas.height;

    while (stack.length > 0) {
      const [fx, fy] = stack.pop()!;
      const pos = (fy * width + fx) * 4;

      if (
        fx < 0 ||
        fx >= width ||
        fy < 0 ||
        fy >= height ||
        !this.colorsMatch(
          [pixels[pos], pixels[pos + 1], pixels[pos + 2], pixels[pos + 3]],
          [targetR, targetG, targetB, targetA],
        )
      ) {
        continue;
      }

      pixels[pos] = fillColorRGBA.r;
      pixels[pos + 1] = fillColorRGBA.g;
      pixels[pos + 2] = fillColorRGBA.b;
      pixels[pos + 3] = fillColorRGBA.a * 255;

      stack.push([fx + 1, fy], [fx - 1, fy], [fx, fy + 1], [fx, fy - 1]);
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Check if two colors match
   */
  private colorsMatch(
    color1: number[],
    color2: number[],
    tolerance = 1,
  ): boolean {
    return (
      Math.abs(color1[0] - color2[0]) <= tolerance &&
      Math.abs(color1[1] - color2[1]) <= tolerance &&
      Math.abs(color1[2] - color2[2]) <= tolerance &&
      Math.abs(color1[3] - color2[3]) <= tolerance
    );
  }

  /**
   * Convert hex color to RGBA
   */
  private hexToRGBA(hex: string): RGBA {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: 1 };
  }

  /**
   * Update the color
   */
  private updateColor(color: string): void {
    this.currentColor = color;
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
  }

  /**
   * Add recent color
   */
  private addRecentColor(color: string): void {
    if (this.recentColors[0] === color) return;

    this.recentColors = this.recentColors.filter((c) => c !== color);
    this.recentColors.unshift(color);

    if (this.recentColors.length > this.maxRecentColors) {
      this.recentColors = this.recentColors.slice(0, this.maxRecentColors);
    }

    this.renderRecentColors();
  }

  /**
   * Render recent colors
   */
  private renderRecentColors(): void {
    const recentColorsContainer = document.getElementById("recentColors");
    if (!recentColorsContainer) return;

    recentColorsContainer.innerHTML = "";

    this.recentColors.forEach((color) => {
      const colorBtn = document.createElement("button");
      colorBtn.className = "recent-color-btn";
      colorBtn.style.backgroundColor = color;
      colorBtn.title = color;

      if (color === this.currentColor) {
        colorBtn.classList.add("active");
      }

      colorBtn.addEventListener("click", () => {
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
   */
  private updateColorPreview(color: string): void {
    const preview = document.getElementById("color-preview");
    if (preview) {
      preview.style.backgroundColor = color;
    }
  }

  /**
   * Start color picking
   */
  private startColorPicking(): void {
    this.isPickingColor = true;
    this.canvas.style.cursor = "crosshair";
    if (this.eyedropperBtn) {
      this.eyedropperBtn.classList.add("active");
    }
  }

  /**
   * Pick a color from the canvas
   */
  private pickColor(e: MouseEvent): void {
    const pos = this.getMousePos(e);
    const pixel = this.ctx.getImageData(pos.x, pos.y, 1, 1).data;

    const color =
      pixel[3] === 0
        ? "#FFFFFF"
        : `#${[pixel[0], pixel[1], pixel[2]].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

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
  private stopColorPicking(): void {
    this.isPickingColor = false;
    this.canvas.style.cursor = "crosshair";
    if (this.eyedropperBtn) {
      this.eyedropperBtn.classList.remove("active");
    }
  }

  /**
   * Show color preview on hover
   */
  private showColorPreview(e: MouseEvent): void {
    const pos = this.getMousePos(e);
    const pixel = this.ctx.getImageData(pos.x, pos.y, 1, 1).data;

    const color =
      pixel[3] === 0
        ? "#FFFFFF"
        : `#${[pixel[0], pixel[1], pixel[2]].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

    if (this.colorPicker) {
      this.colorPicker.color.hexString = color;
    }
  }

  /**
   * Toggle transparency
   */
  private toggleTransparency(): void {
    this.isTransparent = !this.isTransparent;

    if (this.isTransparent) {
      this.transparentBgCanvas.style.display = "block";
      this.opaqueBgCanvas.style.display = "none";
    } else {
      this.transparentBgCanvas.style.display = "none";
      this.opaqueBgCanvas.style.display = "block";
    }

    const transparencyBtn = document.getElementById("transparencyBtn");
    if (transparencyBtn) {
      transparencyBtn.classList.toggle("active", this.isTransparent);
    }
  }

  /**
   * Paste content (stub)
   */
  private pasteContent(): void {
    // TODO: Implement paste from clipboard
  }

  /**
   * Clear canvas
   */
  private clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Load a project image from a URL onto the drawing canvas.
   * The image is drawn at (0,0) and the canvas dimensions are assumed
   * to already match the project dimensions.
   */
  loadProjectImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
        this.saveState();
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load project image"));
      img.src = url;
    });
  }
}

// ============================================================
// DOMContentLoaded — auth gate + canvas settings modal
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const canvasSettingsModal = document.getElementById("canvasSettingsModal")!;
  const startPaintBarBtn = document.getElementById("startPaintBarBtn")!;
  const responsiveCanvas = document.getElementById(
    "responsiveCanvas",
  ) as HTMLInputElement;
  const responsiveLimits = document.getElementById("responsiveLimits")!;
  const widthInput = document.getElementById("canvasWidth") as HTMLInputElement;
  const heightInput = document.getElementById(
    "canvasHeight",
  ) as HTMLInputElement;

  // Hide modal until auth is confirmed
  canvasSettingsModal.classList.add("hidden");

  // Auth gate — redirect to login if not authenticated
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("/login");
      return;
    }

    // Update toolbar auth UI
    const loginBtn = document.getElementById("loginBtn");
    const profileBtn = document.getElementById("profileBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    if (loginBtn) loginBtn.classList.add("hidden");
    if (profileBtn) profileBtn.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");

    // Check for ?project={title} — load existing project, skip settings modal
    const projectTitle = new URLSearchParams(window.location.search).get("project");
    if (projectTitle) {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/projects/by-title?title=${encodeURIComponent(projectTitle)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load project (${res.status})`);

        const project = await res.json();
        const w = project.width || 800;
        const h = project.height || 600;

        // Wire auth UI buttons (normally done in startPaintBarBtn handler)
        document.getElementById("loginBtn")?.addEventListener("click", () => {
          window.location.href = "/login";
        });
        document.getElementById("profileBtn")?.addEventListener("click", () => {
          window.location.href = "/profile";
        });
        document.getElementById("logoutBtn")?.addEventListener("click", () => {
          auth.signOut().catch((error: unknown) => {
            console.error("Error signing out:", error);
          });
        });

        const paintBar = new PaintBar({ width: w, height: h });

        if (project.storageURL) {
          // Download via API proxy (avoids CORS/auth issues with direct emulator URLs)
          const blobRes = await fetch(`/api/projects/${encodeURIComponent(project.id)}/blob`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (blobRes.ok) {
            const imgBlob = await blobRes.blob();
            const blobURL = URL.createObjectURL(imgBlob);
            await paintBar.loadProjectImage(blobURL);
            URL.revokeObjectURL(blobURL);
          }
        }

        // Store project context for re-save (title pre-filled)
        paintBar.projectManager.setLoadedProject(project.id, project.title || "");
        return;
      } catch (err) {
        console.error("Failed to load project:", err);
        // Fall through to settings modal on error
      }
    }

    // No project param (or load failed) — show the settings modal
    canvasSettingsModal.classList.remove("hidden");
  });

  let isSquareLocked = false;

  // Show/hide responsive limits based on checkbox
  responsiveCanvas.addEventListener("change", () => {
    responsiveLimits.style.display = responsiveCanvas.checked
      ? "block"
      : "none";
    validateCanvasSettings();
  });

  // Handle square locking
  const updateSquareLock = (): void => {
    const width = parseInt(widthInput.value, 10);
    const height = parseInt(heightInput.value, 10);

    if (width === height && !isSquareLocked) {
      isSquareLocked = true;
      widthInput.dataset.squareLocked = "true";
      heightInput.dataset.squareLocked = "true";
    } else if (width !== height && isSquareLocked) {
      isSquareLocked = false;
      delete widthInput.dataset.squareLocked;
      delete heightInput.dataset.squareLocked;
    }
  };

  // Maintain square dimensions when locked
  const handleDimensionChange = (
    changedInput: HTMLInputElement,
    otherInput: HTMLInputElement,
  ): void => {
    if (isSquareLocked) {
      otherInput.value = changedInput.value;
    }
    updateSquareLock();
    validateCanvasSettings();
  };

  widthInput.addEventListener("input", () =>
    handleDimensionChange(widthInput, heightInput),
  );
  heightInput.addEventListener("input", () =>
    handleDimensionChange(heightInput, widthInput),
  );

  // Validate canvas settings
  const validateCanvasSettings = (): void => {
    const width = parseInt(widthInput.value, 10);
    const height = parseInt(heightInput.value, 10);
    const isResponsive = responsiveCanvas.checked;
    const minDimension = 250;

    const warningElement =
      document.getElementById("fillToolWarning") ||
      (() => {
        const warning = document.createElement("div");
        warning.id = "fillToolWarning";
        warning.style.color = "#FFFFFF";
        warning.style.marginTop = "12px";
        warning.style.fontSize = "14px";
        document.querySelector(".modal-body")?.appendChild(warning);
        return warning;
      })();

    const warnings: string[] = [];

    if ((width < minDimension || height < minDimension) && !isResponsive) {
      warnings.push("Fill tool will be disabled due to small canvas size.");
    }

    if (isSquareLocked) {
      warnings.push("Canvas is locked to square dimensions.");
    }

    warningElement.textContent = warnings.length
      ? "Note: " + warnings.join(" ")
      : "";
  };

  updateSquareLock();
  validateCanvasSettings();

  // Initialize PaintBar when settings are confirmed
  startPaintBarBtn.addEventListener("click", () => {
    const options: Partial<CanvasOptions> = {
      width: parseInt(widthInput.value, 10),
      height: parseInt(heightInput.value, 10),
      responsive: responsiveCanvas.checked,
      minWidth: parseInt(
        (document.getElementById("minWidth") as HTMLInputElement).value,
        10,
      ),
      minHeight: parseInt(
        (document.getElementById("minHeight") as HTMLInputElement).value,
        10,
      ),
      maxWidth: parseInt(
        (document.getElementById("maxWidth") as HTMLInputElement).value,
        10,
      ),
      maxHeight: parseInt(
        (document.getElementById("maxHeight") as HTMLInputElement).value,
        10,
      ),
      isSquare: isSquareLocked,
    };

    canvasSettingsModal.classList.add("hidden");

    // Update copyright year
    document.querySelectorAll(".copyright-year").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });

    // Auth UI buttons
    const loginBtn = document.getElementById("loginBtn");
    const profileBtn = document.getElementById("profileBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    loginBtn?.addEventListener("click", () => {
      window.location.href = "/login";
    });

    profileBtn?.addEventListener("click", () => {
      window.location.href = "/profile";
    });

    logoutBtn?.addEventListener("click", () => {
      auth.signOut().catch((error: unknown) => {
        console.error("Error signing out:", error);
      });
    });

    // Initialize PaintBar
    // PaintBar self-registers event listeners in constructor
    new PaintBar(options);

    // Disable fill tool if canvas is too small and not responsive
    if (
      (options.width! < 250 || options.height! < 250) &&
      !options.responsive
    ) {
      const fillBtn = document.getElementById(
        "fillBtn",
      ) as HTMLButtonElement | null;
      if (fillBtn) {
        fillBtn.disabled = true;
        fillBtn.title = "Fill tool disabled: Canvas too small";
        fillBtn.style.opacity = "0.5";
        fillBtn.style.cursor = "not-allowed";
      }
    }
  });
});
