// ============================================================
// ToolManager — manages active tool and tool switching
// ============================================================

import {
  PencilTool,
  EraserTool,
  SprayTool,
  FillTool,
  TextTool,
} from "./basicTools";
import {
  RectangleTool,
  CircleTool,
  LineTool,
  TriangleTool,
  ArcTool,
} from "./objectTools";
import { SelectionTool } from "./actionTools";
import type { Point, ToolName } from "../shared/types";
import type { PaintBar } from "./app";
import type { GenericTool } from "./genericTool";

export class ToolManager {
  private paintBar: PaintBar;
  activeTool: GenericTool | null;
  onToolChange: ((tool: GenericTool | null) => void) | null;
  private tools: Record<string, GenericTool>;

  constructor(paintBar: PaintBar) {
    this.paintBar = paintBar;
    this.activeTool = null;
    this.onToolChange = null;

    this.tools = {
      pencil: new PencilTool(paintBar),
      eraser: new EraserTool(paintBar),
      spray: new SprayTool(paintBar),
      fill: new FillTool(paintBar),
      text: new TextTool(paintBar),
      select: new SelectionTool(paintBar),
      rectangle: new RectangleTool(paintBar),
      circle: new CircleTool(paintBar),
      line: new LineTool(paintBar),
      triangle: new TriangleTool(paintBar),
      arc: new ArcTool(paintBar),
    };

    this.setActiveTool("pencil");
  }

  setActiveTool(toolName: ToolName | string): void {
    const newTool = this.tools[toolName];
    if (!newTool) {
      console.warn(`Unknown tool: ${toolName}`);
      return;
    }

    if (this.activeTool) {
      this.activeTool.deactivate();
    }
    this.activeTool = newTool;
    this.activeTool.activate();

    if (this.onToolChange) {
      this.onToolChange(this.activeTool);
    }

    this.updateToolButtons(toolName);
    this.updateCursor(toolName);
    this.updateOverlayVisibility(toolName);
    this.updateTriangleTypeVisibility(toolName);
  }

  private updateToolButtons(toolName: string): void {
    const toolButtons = document.querySelectorAll(".submenu-content button");
    toolButtons.forEach((btn) => btn.classList.remove("active"));

    const buttonId = `${toolName}Btn`;
    const activeBtn = document.getElementById(buttonId);
    if (activeBtn) {
      activeBtn.classList.add("active");
    }
  }

  private updateCursor(toolName: string): void {
    if (toolName === "text") {
      this.paintBar.canvas.style.cursor = "text";
    } else {
      this.paintBar.canvas.style.cursor = "crosshair";
    }
  }

  private updateOverlayVisibility(toolName: string): void {
    const overlayCanvas = this.paintBar.overlayCanvas;
    const isShapeTool = [
      "rectangle",
      "circle",
      "line",
      "triangle",
      "arc",
    ].includes(toolName);

    if (toolName === "select" || isShapeTool) {
      overlayCanvas.classList.add("active");
      overlayCanvas.style.pointerEvents = "auto";
    } else {
      overlayCanvas.classList.remove("active");
      overlayCanvas.style.pointerEvents = "none";
    }
  }

  private updateTriangleTypeVisibility(toolName: string): void {
    const triangleTypeSelect = document.getElementById("triangle-type");
    if (triangleTypeSelect) {
      triangleTypeSelect.style.display =
        toolName === "triangle" ? "block" : "none";
    }
  }

  handleMouseDown(point: Point): void {
    if (this.activeTool) {
      this.activeTool.onMouseDown(point);
    }
  }

  handleMouseMove(point: Point): void {
    if (this.activeTool) {
      this.activeTool.onMouseMove(point);
    }
  }

  handleMouseUp(point: Point): void {
    if (this.activeTool) {
      this.activeTool.onMouseUp(point);
    }
  }

  handleCanvasClick(point: Point): void {
    if (this.activeTool) {
      this.activeTool.onMouseDown(point);
      this.activeTool.onMouseUp(point);
    }
  }
}
