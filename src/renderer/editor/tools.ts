/**
 * Editor Tool System
 * 
 * Defines the interface for editor tools (select, draw wire, place symbol, etc.)
 * Each tool handles mouse/keyboard events differently.
 */

export interface CanvasEvent {
  x: number;          // World coordinates (after transform)
  y: number;
  screenX: number;    // Screen coordinates
  screenY: number;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface EditorTool {
  /** Tool identifier */
  readonly name: string;
  /** Display name for UI */
  readonly displayName: string;
  /** Cursor CSS for this tool */
  readonly cursor: string;

  /** Called when the tool is activated */
  onActivate?(): void;
  /** Called when the tool is deactivated */
  onDeactivate?(): void;

  /** Mouse event handlers */
  onMouseDown?(event: CanvasEvent): void;
  onMouseMove?(event: CanvasEvent): void;
  onMouseUp?(event: CanvasEvent): void;
  onDoubleClick?(event: CanvasEvent): void;

  /** Keyboard handlers */
  onKeyDown?(event: KeyboardEvent): void;
  onKeyUp?(event: KeyboardEvent): void;

  /** Draw tool-specific overlays (selection rect, ghost shapes, etc.) */
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
}

export class ToolManager {
  private tools = new Map<string, EditorTool>();
  private activeTool: EditorTool | null = null;
  private listeners: Array<(toolName: string) => void> = [];

  register(tool: EditorTool): void {
    this.tools.set(tool.name, tool);
  }

  activate(toolName: string): void {
    const tool = this.tools.get(toolName);
    if (!tool) return;

    this.activeTool?.onDeactivate?.();
    this.activeTool = tool;
    tool.onActivate?.();

    for (const listener of this.listeners) {
      listener(toolName);
    }
  }

  getActive(): EditorTool | null {
    return this.activeTool;
  }

  getActiveName(): string {
    return this.activeTool?.name ?? '';
  }

  getAll(): EditorTool[] {
    return [...this.tools.values()];
  }

  onChange(listener: (toolName: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

// --- Built-in tools ---

export class SelectTool implements EditorTool {
  readonly name = 'select';
  readonly displayName = 'Select';
  readonly cursor = 'default';

  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragEnd = { x: 0, y: 0 };

  constructor(
    private onSelect: (x: number, y: number, additive: boolean) => void,
    private onBoxSelect: (rect: { minX: number; minY: number; maxX: number; maxY: number }, additive: boolean) => void,
    private onMove: (dx: number, dy: number) => void,
  ) {}

  onMouseDown(event: CanvasEvent): void {
    this.isDragging = true;
    this.dragStart = { x: event.x, y: event.y };
    this.dragEnd = { x: event.x, y: event.y };
  }

  onMouseMove(event: CanvasEvent): void {
    if (this.isDragging) {
      this.dragEnd = { x: event.x, y: event.y };
    }
  }

  onMouseUp(event: CanvasEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;

    const dx = event.x - this.dragStart.x;
    const dy = event.y - this.dragStart.y;

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      // Click select
      this.onSelect(event.x, event.y, event.shiftKey);
    } else {
      // Box select
      this.onBoxSelect({
        minX: Math.min(this.dragStart.x, event.x),
        minY: Math.min(this.dragStart.y, event.y),
        maxX: Math.max(this.dragStart.x, event.x),
        maxY: Math.max(this.dragStart.y, event.y),
      }, event.shiftKey);
    }
  }

  drawOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.isDragging) return;

    const x = Math.min(this.dragStart.x, this.dragEnd.x);
    const y = Math.min(this.dragStart.y, this.dragEnd.y);
    const w = Math.abs(this.dragEnd.x - this.dragStart.x);
    const h = Math.abs(this.dragEnd.y - this.dragStart.y);

    ctx.strokeStyle = 'rgba(137, 180, 250, 0.8)';
    ctx.fillStyle = 'rgba(137, 180, 250, 0.1)';
    ctx.lineWidth = 0.1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillRect(x, y, w, h);
  }
}

export class DrawWireTool implements EditorTool {
  readonly name = 'wire';
  readonly displayName = 'Draw Wire';
  readonly cursor = 'crosshair';

  private isDrawing = false;
  private points: Array<{ x: number; y: number }> = [];
  private currentPoint = { x: 0, y: 0 };

  constructor(
    private gridSize: number,
    private onComplete: (points: Array<{ x: number; y: number }>) => void,
  ) {}

  private snapToGrid(value: number): number {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  onMouseDown(event: CanvasEvent): void {
    const x = this.snapToGrid(event.x);
    const y = this.snapToGrid(event.y);

    if (!this.isDrawing) {
      this.isDrawing = true;
      this.points = [{ x, y }];
    } else {
      this.points.push({ x, y });
    }
  }

  onMouseMove(event: CanvasEvent): void {
    this.currentPoint = {
      x: this.snapToGrid(event.x),
      y: this.snapToGrid(event.y),
    };
  }

  onDoubleClick(_event: CanvasEvent): void {
    if (this.isDrawing && this.points.length >= 2) {
      this.onComplete(this.points);
      this.isDrawing = false;
      this.points = [];
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.isDrawing = false;
      this.points = [];
    }
  }

  drawOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.isDrawing || this.points.length === 0) return;

    ctx.strokeStyle = '#a6e3a1';
    ctx.lineWidth = 0.2;
    ctx.setLineDash([0.5, 0.3]);

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.lineTo(this.currentPoint.x, this.currentPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw snap point
    ctx.fillStyle = '#a6e3a1';
    ctx.beginPath();
    ctx.arc(this.currentPoint.x, this.currentPoint.y, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}
