// ============================================================
// Action tools: Selection
// ============================================================

import { GenericTool } from './genericTool';
import type { Point, SelectionArea } from '../shared/types';
import type { PaintBar } from './app';

export class SelectionTool extends GenericTool {
    private startPoint: Point | null;
    private endPoint: Point | null;
    private isSelecting: boolean;
    private selectedArea: SelectionArea | null;
    private selectionData: ImageData | null;

    constructor(paintBar: PaintBar) {
        super(paintBar);
        this.startPoint = null;
        this.endPoint = null;
        this.isSelecting = false;
        this.selectedArea = null;
        this.selectionData = null;
    }

    onMouseDown(point: Point): void {
        super.onMouseDown(point);
        this.startPoint = point;
        this.isSelecting = true;
        this.clearSelection();
    }

    onMouseMove(point: Point): void {
        if (!this.isSelecting) return;

        this.endPoint = point;
        this.drawSelectionBox();
    }

    onMouseUp(point: Point): void {
        if (!this.isSelecting || !this.startPoint) return;

        this.endPoint = point;
        this.isSelecting = false;

        const x = Math.min(this.startPoint.x, this.endPoint.x);
        const y = Math.min(this.startPoint.y, this.endPoint.y);
        const width = Math.abs(this.endPoint.x - this.startPoint.x);
        const height = Math.abs(this.endPoint.y - this.startPoint.y);

        // Zero-area selection (click without drag) — treat as no selection
        if (width === 0 || height === 0) {
            this.clearSelection();
            return;
        }

        this.selectedArea = { x, y, width, height };

        const ctx = this.paintBar.ctx;
        this.selectionData = ctx.getImageData(x, y, width, height);

        this.drawSelectionBox();
    }

    private drawSelectionBox(): void {
        if (!this.startPoint || !this.endPoint) return;

        const overlayCtx = this.paintBar.overlayCtx;
        overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);

        const x = Math.min(this.startPoint.x, this.endPoint.x);
        const y = Math.min(this.startPoint.y, this.endPoint.y);
        const width = Math.abs(this.endPoint.x - this.startPoint.x);
        const height = Math.abs(this.endPoint.y - this.startPoint.y);

        overlayCtx.strokeStyle = '#00f';
        overlayCtx.lineWidth = 1;
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(x, y, width, height);
        overlayCtx.setLineDash([]);
    }

    private clearSelection(): void {
        const overlayCtx = this.paintBar.overlayCtx;
        overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
        this.selectedArea = null;
        this.selectionData = null;
        this.startPoint = null;
        this.endPoint = null;
    }

    getSelectedArea(): SelectionArea | null {
        return this.selectedArea;
    }

    getSelectionData(): ImageData | null {
        return this.selectionData;
    }

    activate(): void {
        super.activate();
        this.paintBar.overlayCanvas.style.pointerEvents = 'auto';
    }

    deactivate(): void {
        super.deactivate();
        this.paintBar.overlayCanvas.style.pointerEvents = 'none';
        this.clearSelection();
    }
}
