// ============================================================
// GenericTool — base class for all drawing tools
// ============================================================

import type { Point } from "../shared/types";
import type { PaintBar } from "./app";

export class GenericTool {
  protected paintBar: PaintBar;
  protected isDrawing: boolean;
  protected lastX: number;
  protected lastY: number;

  constructor(paintBar: PaintBar) {
    this.paintBar = paintBar;
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
  }

  // Mouse event handlers
  onMouseDown(point: Point): void {
    this.isDrawing = true;
    this.lastX = point.x;
    this.lastY = point.y;
  }

  onMouseMove(_point: Point): void {
    // Override in specific tools
  }

  onMouseUp(_point: Point): void {
    this.isDrawing = false;
  }

  // Tool lifecycle methods
  activate(): void {
    this.paintBar.canvas.style.cursor = "crosshair";
  }

  deactivate(): void {
    // Clean up any tool-specific state
  }

  // Helper methods
  saveState(): void {
    this.paintBar.saveState();
  }

  getContext(): CanvasRenderingContext2D {
    return this.paintBar.ctx;
  }

  getOverlayContext(): CanvasRenderingContext2D {
    return this.paintBar.overlayCtx;
  }

  clearOverlay(): void {
    const ctx = this.getOverlayContext();
    ctx.clearRect(
      0,
      0,
      this.paintBar.overlayCanvas.width,
      this.paintBar.overlayCanvas.height,
    );
  }

  applyBrushSettings(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    ctx.save();
    ctx.strokeStyle = this.paintBar.currentColor;
    ctx.fillStyle = this.paintBar.currentColor;
    ctx.lineWidth = this.paintBar.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  restoreContext(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  getPointsBetween(x1: number, y1: number, x2: number, y2: number): Point[] {
    const points: Point[] = [];
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
}
