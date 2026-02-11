// ============================================================
// Shape tools: Rectangle, Circle, Line, Triangle, Arc
// ============================================================

import { GenericTool } from "./genericTool";
import type { Point, TriangleType } from "../shared/types";
import type { PaintBar } from "./app";

class ShapeTool extends GenericTool {
  protected startPoint: Point | null;

  constructor(paintBar: PaintBar) {
    super(paintBar);
    this.startPoint = null;
  }

  onMouseDown(point: Point): void {
    super.onMouseDown(point);
    this.startPoint = point;
  }

  onMouseMove(point: Point): void {
    if (!this.isDrawing) return;
    this.clearOverlay();
    this.drawPreview(point);
  }

  onMouseUp(point: Point): void {
    if (!this.isDrawing || !this.startPoint) return;

    const mainCtx = this.getContext();
    mainCtx.save();

    mainCtx.strokeStyle = this.paintBar.currentColor;
    mainCtx.fillStyle = this.paintBar.currentColor;
    mainCtx.lineWidth = this.paintBar.lineWidth;
    mainCtx.lineCap = "round";
    mainCtx.lineJoin = "round";

    this.drawShape(mainCtx, point);

    mainCtx.restore();
    this.clearOverlay();

    this.isDrawing = false;
    this.startPoint = null;
  }

  activate(): void {
    super.activate();
    this.paintBar.overlayCanvas.style.pointerEvents = "auto";
  }

  deactivate(): void {
    this.paintBar.overlayCanvas.style.pointerEvents = "none";
    this.clearOverlay();
    this.isDrawing = false;
    this.startPoint = null;
  }

  protected drawPreview(point: Point): void {
    const overlayCtx = this.getOverlayContext();
    overlayCtx.save();

    overlayCtx.strokeStyle = this.paintBar.currentColor;
    overlayCtx.fillStyle = this.paintBar.currentColor;
    overlayCtx.lineWidth = this.paintBar.lineWidth;
    overlayCtx.lineCap = "round";
    overlayCtx.lineJoin = "round";

    this.drawShape(overlayCtx, point);

    overlayCtx.restore();
  }

  protected drawShape(_ctx: CanvasRenderingContext2D, _point: Point): void {
    // Override in specific shape tools
  }
}

export class RectangleTool extends ShapeTool {
  protected drawShape(ctx: CanvasRenderingContext2D, point: Point): void {
    if (!this.startPoint) return;
    const width = point.x - this.startPoint.x;
    const height = point.y - this.startPoint.y;

    ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);

    if (this.paintBar.fillShape) {
      ctx.fillRect(this.startPoint.x, this.startPoint.y, width, height);
    }
  }
}

export class CircleTool extends ShapeTool {
  protected drawShape(ctx: CanvasRenderingContext2D, point: Point): void {
    if (!this.startPoint) return;
    const radius = Math.sqrt(
      Math.pow(point.x - this.startPoint.x, 2) +
        Math.pow(point.y - this.startPoint.y, 2),
    );

    ctx.beginPath();
    ctx.arc(this.startPoint.x, this.startPoint.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (this.paintBar.fillShape) {
      ctx.fill();
    }
  }
}

export class LineTool extends ShapeTool {
  protected drawShape(ctx: CanvasRenderingContext2D, point: Point): void {
    if (!this.startPoint) return;
    const oldLineCap = ctx.lineCap;

    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    ctx.lineCap = oldLineCap;
  }
}

export class TriangleTool extends ShapeTool {
  protected drawShape(ctx: CanvasRenderingContext2D, point: Point): void {
    if (!this.startPoint) return;
    const points = this.calculateTrianglePoints(point);

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.closePath();
    ctx.stroke();

    if (this.paintBar.fillShape) {
      ctx.fill();
    }
  }

  private calculateTrianglePoints(point: Point): Point[] {
    if (!this.startPoint) return [point, point, point];
    const type: TriangleType = this.paintBar.triangleType || "equilateral";
    const dx = point.x - this.startPoint.x;
    const dy = point.y - this.startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    switch (type) {
      case "right":
        return [this.startPoint, { x: point.x, y: this.startPoint.y }, point];

      case "isosceles": {
        const baseWidth = distance * 0.8;
        const baseAngle = angle + Math.PI / 2;

        return [
          this.startPoint,
          {
            x: point.x + (baseWidth / 2) * Math.cos(baseAngle),
            y: point.y + (baseWidth / 2) * Math.sin(baseAngle),
          },
          {
            x: point.x - (baseWidth / 2) * Math.cos(baseAngle),
            y: point.y - (baseWidth / 2) * Math.sin(baseAngle),
          },
        ];
      }

      case "equilateral":
      default: {
        if (distance === 0)
          return [this.startPoint, this.startPoint, this.startPoint];
        const side = distance;
        const height = (side * Math.sqrt(3)) / 2;

        const dirX = dx / distance;
        const dirY = dy / distance;
        const perpX = -dirY;
        const perpY = dirX;

        const baseCenterX = this.startPoint.x + dirX * height;
        const baseCenterY = this.startPoint.y + dirY * height;

        const halfSide = side / 2;
        return [
          this.startPoint,
          {
            x: baseCenterX + perpX * halfSide,
            y: baseCenterY + perpY * halfSide,
          },
          {
            x: baseCenterX - perpX * halfSide,
            y: baseCenterY - perpY * halfSide,
          },
        ];
      }
    }
  }

  activate(): void {
    super.activate();
    const triangleTypeSelect = document.getElementById("triangle-type");
    if (triangleTypeSelect) {
      triangleTypeSelect.style.display = "block";
    }
  }

  deactivate(): void {
    super.deactivate();
    const triangleTypeSelect = document.getElementById("triangle-type");
    if (triangleTypeSelect) {
      triangleTypeSelect.style.display = "none";
    }
  }
}

export class ArcTool extends ShapeTool {
  private endPoint: Point | null;
  private midPoint: Point | null;
  private arcPhase: "line" | "arc";

  constructor(paintBar: PaintBar) {
    super(paintBar);
    this.endPoint = null;
    this.midPoint = null;
    this.arcPhase = "line";
  }

  onMouseDown(point: Point): void {
    if (this.arcPhase === "line") {
      super.onMouseDown(point);
    } else if (this.arcPhase === "arc" && this.startPoint && this.endPoint) {
      this.midPoint = point;
      this.isDrawing = true;
    }
  }

  onMouseMove(point: Point): void {
    if (!this.isDrawing) return;
    this.clearOverlay();

    if (this.arcPhase === "line") {
      this.drawPreview(point);
    } else if (this.arcPhase === "arc" && this.startPoint && this.endPoint) {
      this.midPoint = point;
      this.drawPreview(point);
    }
  }

  onMouseUp(point: Point): void {
    if (!this.isDrawing) return;

    if (this.arcPhase === "line") {
      this.endPoint = point;
      this.arcPhase = "arc";
      this.isDrawing = false;
    } else if (this.arcPhase === "arc") {
      const mainCtx = this.getContext();
      mainCtx.save();

      mainCtx.strokeStyle = this.paintBar.currentColor;
      mainCtx.fillStyle = this.paintBar.currentColor;
      mainCtx.lineWidth = this.paintBar.lineWidth;
      mainCtx.lineCap = "round";
      mainCtx.lineJoin = "round";

      this.drawShape(mainCtx, point);

      mainCtx.restore();
      this.clearOverlay();

      this.isDrawing = false;
      this.startPoint = null;
      this.endPoint = null;
      this.midPoint = null;
      this.arcPhase = "line";
    }
  }

  protected drawShape(ctx: CanvasRenderingContext2D, point: Point): void {
    if (this.arcPhase === "line" && this.startPoint) {
      ctx.beginPath();
      ctx.moveTo(this.startPoint.x, this.startPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else if (this.arcPhase === "arc" && this.startPoint && this.endPoint) {
      const controlPoint = point;

      ctx.beginPath();
      ctx.moveTo(this.startPoint.x, this.startPoint.y);
      ctx.quadraticCurveTo(
        controlPoint.x,
        controlPoint.y,
        this.endPoint.x,
        this.endPoint.y,
      );
      ctx.stroke();
    }
  }

  deactivate(): void {
    super.deactivate();
    this.arcPhase = "line";
    this.endPoint = null;
    this.midPoint = null;
  }
}
