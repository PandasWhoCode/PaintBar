import { GenericTool } from './genericTool.js';

export class SelectionTool extends GenericTool {
    constructor(paintBar) {
        super(paintBar);
        this.startPoint = null;
        this.endPoint = null;
        this.isSelecting = false;
        this.selectedArea = null;
        this.selectionData = null;
    }

    onMouseDown(point) {
        super.onMouseDown(point);
        this.startPoint = point;
        this.isSelecting = true;
        this.clearSelection();
    }

    onMouseMove(point) {
        if (!this.isSelecting) return;

        this.endPoint = point;
        this.drawSelectionBox();
    }

    onMouseUp(point) {
        if (!this.isSelecting) return;

        this.endPoint = point;
        this.isSelecting = false;
        
        // Store the selected area
        const x = Math.min(this.startPoint.x, this.endPoint.x);
        const y = Math.min(this.startPoint.y, this.endPoint.y);
        const width = Math.abs(this.endPoint.x - this.startPoint.x);
        const height = Math.abs(this.endPoint.y - this.startPoint.y);
        
        this.selectedArea = { x, y, width, height };
        
        // Store the selection data
        const ctx = this.paintBar.ctx;
        this.selectionData = ctx.getImageData(x, y, width, height);
        
        // Draw final selection box
        this.drawSelectionBox();
    }

    drawSelectionBox() {
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

    clearSelection() {
        const overlayCtx = this.paintBar.overlayCtx;
        overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
        this.selectedArea = null;
        this.selectionData = null;
        this.startPoint = null;
        this.endPoint = null;
    }

    getSelectedArea() {
        return this.selectedArea;
    }

    getSelectionData() {
        return this.selectionData;
    }

    activate() {
        super.activate();
        this.paintBar.overlayCanvas.style.pointerEvents = 'auto';
    }

    deactivate() {
        super.deactivate();
        this.paintBar.overlayCanvas.style.pointerEvents = 'none';
        this.clearSelection();
    }
}
