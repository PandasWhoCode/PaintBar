// ============================================================
// CanvasManager — manages canvas layers, sizing, and resizing
// ============================================================

import type { CanvasLayers } from '../shared/types';
import type { PaintBar } from './app';

interface CanvasManagerOptions {
    width?: number;
    height?: number;
    responsive?: boolean;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
}

export class CanvasManager {
    private paintBar: PaintBar;
    private canvases: CanvasLayers;
    private canvasWidth: number;
    private canvasHeight: number;
    private minWidth: number;
    private minHeight: number;
    private maxWidth: number;
    private maxHeight: number;
    private responsiveCanvas: boolean;

    constructor(paintBar: PaintBar, options: CanvasManagerOptions = {}) {
        this.paintBar = paintBar;
        this.canvases = {
            transparentBg: paintBar.transparentBgCanvas,
            opaqueBg: paintBar.opaqueBgCanvas,
            drawing: paintBar.canvas,
            overlay: paintBar.overlayCanvas,
        };

        this.canvasWidth = options.width || 800;
        this.canvasHeight = options.height || 600;
        this.minWidth = options.minWidth || 300;
        this.minHeight = options.minHeight || 200;
        this.maxWidth = options.maxWidth || 4096;
        this.maxHeight = options.maxHeight || 4096;
        this.responsiveCanvas = options.responsive !== undefined ? options.responsive : true;

        if (this.paintBar.isSquare) {
            const size = Math.min(this.canvasWidth, this.canvasHeight);
            this.canvasWidth = size;
            this.canvasHeight = size;

            const minSize = Math.max(this.minWidth, this.minHeight);
            const maxSize = Math.min(this.maxWidth, this.maxHeight);
            this.minWidth = this.minHeight = minSize;
            this.maxWidth = this.maxHeight = maxSize;
        }

        this.initializeCanvases();
    }

    initializeCanvases(): void {
        Object.values(this.canvases).forEach(canvas => {
            this.setCanvasSize(canvas);
        });

        const container = this.canvases.drawing.parentElement;
        if (container) {
            if (this.paintBar.isSquare) {
                container.classList.add('square-locked');
            } else {
                container.classList.remove('square-locked');
            }
        }

        this.initializeTransparentBackground();
        this.initializeOpaqueBackground();
        this.initializeDrawingCanvas();
        this.initializeOverlayCanvas();

        if (this.responsiveCanvas) {
            this.setupResizeListener();
        }
    }

    private setCanvasSize(canvas: HTMLCanvasElement): void {
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;

        const wrapper = canvas.parentElement;
        if (!wrapper) return;

        const container = wrapper.parentElement;
        if (!container) return;
        const availableWidth = container.clientWidth - 40;
        const availableHeight = container.clientHeight - 40;

        if (this.paintBar.isSquare) {
            const size = Math.min(availableWidth, availableHeight);
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
        } else {
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            const canvasAspectRatio = this.canvasWidth / this.canvasHeight;
            const containerAspectRatio = availableWidth / availableHeight;

            if (containerAspectRatio > canvasAspectRatio) {
                const width = availableHeight * canvasAspectRatio;
                wrapper.style.width = `${width}px`;
                wrapper.style.height = `${availableHeight}px`;
            } else {
                const height = availableWidth / canvasAspectRatio;
                wrapper.style.width = `${availableWidth}px`;
                wrapper.style.height = `${height}px`;
            }
        }
    }

    private initializeTransparentBackground(): void {
        this.paintBar.drawTransparentBackground();
    }

    private initializeOpaqueBackground(): void {
        const ctx = this.canvases.opaqueBg.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    private initializeDrawingCanvas(): void {
        const ctx = this.canvases.drawing.getContext('2d')!;
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    private initializeOverlayCanvas(): void {
        const ctx = this.canvases.overlay.getContext('2d')!;
        ctx.strokeStyle = this.paintBar.currentColor;
        ctx.fillStyle = this.paintBar.currentColor;
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    private setupResizeListener(): void {
        let resizeTimeout: ReturnType<typeof setTimeout>;
        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 100);
        });
    }

    private handleResize(): void {
        if (!this.responsiveCanvas) return;

        const wrapper = this.canvases.drawing.parentElement;
        if (!wrapper) return;

        const container = wrapper.parentElement;
        if (!container) return;
        const availableWidth = container.clientWidth - 40;
        const availableHeight = container.clientHeight - 40;

        if (this.paintBar.isSquare) {
            wrapper.classList.add('square-locked');
        } else {
            wrapper.classList.remove('square-locked');

            const canvasAspectRatio = this.canvasWidth / this.canvasHeight;
            const containerAspectRatio = availableWidth / availableHeight;

            let displayWidth: number;
            let displayHeight: number;

            if (containerAspectRatio > canvasAspectRatio) {
                displayHeight = availableHeight;
                displayWidth = displayHeight * canvasAspectRatio;
            } else {
                displayWidth = availableWidth;
                displayHeight = displayWidth / canvasAspectRatio;
            }

            Object.values(this.canvases).forEach(canvas => {
                canvas.style.width = `${displayWidth}px`;
                canvas.style.height = `${displayHeight}px`;
            });
        }

        // Capture drawing state BEFORE resetting dimensions (setting
        // canvas.width/height clears the bitmap)
        const drawingState = this.canvases.drawing.getContext('2d')!
            .getImageData(0, 0, this.canvasWidth, this.canvasHeight);

        Object.values(this.canvases).forEach(canvas => {
            canvas.width = this.canvasWidth;
            canvas.height = this.canvasHeight;
        });

        this.redrawCanvases(drawingState);
    }

    private redrawCanvases(drawingState: ImageData): void {
        this.initializeTransparentBackground();
        this.initializeOpaqueBackground();

        this.canvases.drawing.getContext('2d')!.putImageData(drawingState, 0, 0);

        this.initializeOverlayCanvas();
    }

    updateCanvasSettings(settings: {
        style?: string;
        width?: number;
        height?: number;
        responsive?: boolean;
    }): void {
        this.canvasWidth = settings.width || this.canvasWidth;
        this.canvasHeight = settings.height || this.canvasHeight;
        this.responsiveCanvas = settings.responsive !== undefined ? settings.responsive : this.responsiveCanvas;

        this.initializeCanvases();
    }
}
