import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, Grid3X3, MousePointer, Pencil, ExternalLink, ChevronRight, ArrowUp } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import {
  KicadSchematicParser,
  type SchematicData,
  type SchematicElement,
  type LibSymbol,
  type LibGraphic,
  type LibPin,
  type Sheet,
  type Bus,
  type BusEntry,
} from '../../parser/schematicParser';

interface SchematicViewerProps {
  content: string;
  filePath: string;
}

interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function SchematicViewer({ content, filePath }: SchematicViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<ViewTransform>({ offsetX: 0, offsetY: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [schematic, setSchematic] = useState<SchematicData | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [mode, setMode] = useState<'select' | 'edit'>('select');
  const [hasFitted, setHasFitted] = useState(false);

  // Hierarchical navigation: stack of parent file paths
  const [hierarchyStack, setHierarchyStack] = useState<string[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState(filePath);
  const [currentContent, setCurrentContent] = useState(content);
  const openTab = useAppStore(s => s.openTab);

  // Reset when the external content/filePath changes (new tab opened)
  useEffect(() => {
    setCurrentFilePath(filePath);
    setCurrentContent(content);
    setHierarchyStack([]);
  }, [filePath, content]);

  // Parse schematic
  useEffect(() => {
    if (!currentContent || !currentContent.trim()) return;
    try {
      const parser = new KicadSchematicParser();
      const parsed = parser.parse(currentContent);
      setSchematic(parsed);
      setHasFitted(false);
    } catch (err) {
      console.warn('Failed to parse schematic:', (err as Error).message);
      setSchematic(null);
    }
  }, [currentContent]);

  // Navigate into a hierarchical sheet
  const navigateInto = useCallback(async (sheet: Sheet) => {
    if (!sheet.fileName) return;
    // Resolve the sub-schematic path relative to current file
    const dir = currentFilePath.replace(/[\\/][^\\/]+$/, '');
    const subPath = dir + '/' + sheet.fileName;
    try {
      const subContent = await window.api.readFile(subPath);
      setHierarchyStack(prev => [...prev, currentFilePath]);
      setCurrentFilePath(subPath);
      setCurrentContent(subContent);
      setHasFitted(false);
    } catch (err) {
      console.warn('Failed to load sub-schematic:', err);
    }
  }, [currentFilePath]);

  // Navigate up one level
  const navigateUp = useCallback(async () => {
    if (hierarchyStack.length === 0) return;
    const parentPath = hierarchyStack[hierarchyStack.length - 1];
    try {
      const parentContent = await window.api.readFile(parentPath);
      setHierarchyStack(prev => prev.slice(0, -1));
      setCurrentFilePath(parentPath);
      setCurrentContent(parentContent);
      setHasFitted(false);
    } catch (err) {
      console.warn('Failed to navigate up:', err);
    }
  }, [hierarchyStack]);

  // Handle double-click on canvas to enter sheet
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!schematic || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // Convert screen coords to schematic coords
    const sx = (e.clientX - rect.left - rect.width / 2 - transform.offsetX) / transform.scale;
    const sy = (e.clientY - rect.top - rect.height / 2 - transform.offsetY) / transform.scale;
    // Check if click is inside any sheet
    for (const sheet of schematic.sheets) {
      if (sx >= sheet.x && sx <= sheet.x + sheet.width &&
          sy >= sheet.y && sy <= sheet.y + sheet.height) {
        navigateInto(sheet);
        return;
      }
    }
  }, [schematic, transform, navigateInto]);

  // Auto-fit on first parse
  useEffect(() => {
    if (!schematic || hasFitted || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = calculateBounds(schematic);
    if (!bounds) return;

    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    if (contentW <= 0 || contentH <= 0) return;

    const padding = 0.85;
    const scaleX = (rect.width * padding) / contentW;
    const scaleY = (rect.height * padding) / contentH;
    const scale = Math.min(scaleX, scaleY);

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    setTransform({
      offsetX: -centerX * scale,
      offsetY: -centerY * scale,
      scale,
    });
    setHasFitted(true);
  }, [schematic, hasFitted]);

  // Render on canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !schematic) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(rect.width / 2 + transform.offsetX, rect.height / 2 + transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    // Grid
    if (showGrid) {
      drawGrid(ctx, rect.width, rect.height, transform);
    }

    // Draw schematic elements
    drawSchematic(ctx, schematic);

    ctx.restore();

    // Info overlay
    ctx.fillStyle = '#6c7086';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(`Zoom: ${(transform.scale * 100).toFixed(0)}%`, 8, rect.height - 8);
    ctx.fillText(
      `${schematic.symbols.length} symbols, ${schematic.wires.length} wires`,
      8, rect.height - 24,
    );
  }, [schematic, transform, showGrid]);

  useEffect(() => {
    requestAnimationFrame(render);
  }, [render]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(render));
    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  // Mouse handlers for pan/zoom - native for { passive: false }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform(t => ({
        ...t,
        scale: Math.max(0.05, Math.min(50, t.scale * delta)),
      }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey) || e.button === 0) {
      setIsPanning(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setTransform(t => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  }, [isPanning, lastMouse]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const zoomIn = () => setTransform(t => ({ ...t, scale: t.scale * 1.2 }));
  const zoomOut = () => setTransform(t => ({ ...t, scale: t.scale / 1.2 }));
  const fitView = () => {
    setHasFitted(false);
    // trigger re-fit
    setTimeout(() => setHasFitted(false), 0);
    if (!schematic || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const bounds = calculateBounds(schematic);
    if (!bounds) return;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    if (contentW <= 0 || contentH <= 0) return;
    const padding = 0.85;
    const scaleX = (rect.width * padding) / contentW;
    const scaleY = (rect.height * padding) / contentH;
    const scale = Math.min(scaleX, scaleY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    setTransform({ offsetX: -centerX * scale, offsetY: -centerY * scale, scale });
  };

  // Extract filename from path for breadcrumb
  const getFileName = (p: string) => p.replace(/^.*[\\/]/, '');

  return (
    <div className="viewer-container" ref={containerRef}>
      {/* Hierarchy breadcrumb bar */}
      {hierarchyStack.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
          background: '#181825', borderBottom: '1px solid #313244',
          fontSize: 11, color: '#cdd6f4', flexShrink: 0,
        }}>
          <button onClick={navigateUp} style={{
            background: 'none', border: 'none', color: '#89b4fa', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2, padding: '2px 4px', borderRadius: 3,
            fontSize: 11,
          }} title="Go up one level">
            <ArrowUp size={12} /> Up
          </button>
          <ChevronRight size={10} style={{ color: '#585b70' }} />
          {hierarchyStack.map((p, i) => (
            <React.Fragment key={i}>
              <span style={{ color: '#6c7086', cursor: 'pointer' }} onClick={async () => {
                // Navigate to this level
                const targetPath = p;
                try {
                  const c = await window.api.readFile(targetPath);
                  setHierarchyStack(hierarchyStack.slice(0, i));
                  setCurrentFilePath(targetPath);
                  setCurrentContent(c);
                  setHasFitted(false);
                } catch {}
              }}>{getFileName(p)}</span>
              <ChevronRight size={10} style={{ color: '#585b70' }} />
            </React.Fragment>
          ))}
          <span style={{ color: '#f9e2af' }}>{getFileName(currentFilePath)}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <button
          className={`toolbar-btn ${mode === 'select' ? 'active' : ''}`}
          onClick={() => setMode('select')}
          title="Select Mode"
        >
          <MousePointer size={16} />
        </button>
        <button
          className={`toolbar-btn ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => setMode('edit')}
          title="Edit Mode"
        >
          <Pencil size={16} />
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" onClick={zoomIn} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="toolbar-btn" onClick={zoomOut} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="toolbar-btn" onClick={fitView} title="Fit View">
          <Maximize size={16} />
        </button>
        <button
          className={`toolbar-btn ${showGrid ? 'active' : ''}`}
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Grid"
        >
          <Grid3X3 size={16} />
        </button>
        <div className="toolbar-separator" />
        <button
          className="toolbar-btn"
          onClick={() => window.api.launchKicad(currentFilePath)}
          title="Open in KiCad"
        >
          <ExternalLink size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
          {schematic ? `${schematic.symbols.length} symbols, ${schematic.wires.length} wires` : 'Loading...'}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        style={{ cursor: isPanning ? 'grabbing' : (mode === 'edit' ? 'crosshair' : 'grab') }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}

// ============================================================
// HELPER: Calculate bounding box
// ============================================================

function calculateBounds(sch: SchematicData) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const expand = (x: number, y: number, margin = 0) => {
    minX = Math.min(minX, x - margin);
    minY = Math.min(minY, y - margin);
    maxX = Math.max(maxX, x + margin);
    maxY = Math.max(maxY, y + margin);
  };

  for (const s of sch.symbols) expand(s.x, s.y, 15);
  for (const w of sch.wires) {
    expand(w.startX, w.startY);
    expand(w.endX, w.endY);
  }
  for (const j of sch.junctions) expand(j.x, j.y);
  for (const l of sch.labels) expand(l.x, l.y, 5);
  for (const nc of sch.noConnects) expand(nc.x, nc.y);
  for (const sh of sch.sheets) {
    expand(sh.x, sh.y, 2);
    expand(sh.x + sh.width, sh.y + sh.height, 2);
  }
  for (const b of sch.buses) {
    expand(b.startX, b.startY);
    expand(b.endX, b.endY);
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

// ============================================================
// GRID
// ============================================================

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, transform: ViewTransform) {
  const gridSize = 1.27; // mm (KiCad default grid = 50mil = 1.27mm)
  const gridPixels = gridSize * transform.scale;

  if (gridPixels < 4) return; // too dense

  ctx.fillStyle = 'rgba(69, 71, 90, 0.4)';
  const startX = -width / (2 * transform.scale) - transform.offsetX / transform.scale;
  const startY = -height / (2 * transform.scale) - transform.offsetY / transform.scale;
  const endX = startX + width / transform.scale;
  const endY = startY + height / transform.scale;

  const firstX = Math.floor(startX / gridSize) * gridSize;
  const firstY = Math.floor(startY / gridSize) * gridSize;

  const dotSize = 0.06;
  for (let x = firstX; x <= endX; x += gridSize) {
    for (let y = firstY; y <= endY; y += gridSize) {
      ctx.fillRect(x - dotSize, y - dotSize, dotSize * 2, dotSize * 2);
    }
  }
}

// ============================================================
// SCHEMATIC DRAWING
// ============================================================

function drawSchematic(ctx: CanvasRenderingContext2D, sch: SchematicData) {
  // 1. Wires
  ctx.strokeStyle = '#a6e3a1';
  ctx.lineWidth = 0.15;
  ctx.lineCap = 'round';
  for (const wire of sch.wires) {
    ctx.beginPath();
    ctx.moveTo(wire.startX, wire.startY);
    ctx.lineTo(wire.endX, wire.endY);
    ctx.stroke();
  }

  // 2. Buses
  ctx.strokeStyle = '#89b4fa';
  ctx.lineWidth = 0.35;
  ctx.lineCap = 'round';
  for (const bus of sch.buses) {
    ctx.beginPath();
    ctx.moveTo(bus.startX, bus.startY);
    ctx.lineTo(bus.endX, bus.endY);
    ctx.stroke();
  }

  // 2b. Bus entries
  ctx.strokeStyle = '#89b4fa';
  ctx.lineWidth = 0.15;
  for (const be of sch.busEntries) {
    ctx.beginPath();
    ctx.moveTo(be.x, be.y);
    ctx.lineTo(be.x + be.sizeW, be.y + be.sizeH);
    ctx.stroke();
  }

  // 3. Junctions
  ctx.fillStyle = '#a6e3a1';
  for (const junction of sch.junctions) {
    ctx.beginPath();
    ctx.arc(junction.x, junction.y, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Symbols
  for (const symbol of sch.symbols) {
    drawSymbol(ctx, symbol, sch.libSymbols);
  }

  // 5. Labels
  for (const label of sch.labels) {
    drawLabel(ctx, label);
  }

  // 6. No-connects
  ctx.strokeStyle = '#f38ba8';
  ctx.lineWidth = 0.15;
  for (const nc of sch.noConnects) {
    const s = 0.6;
    ctx.beginPath();
    ctx.moveTo(nc.x - s, nc.y - s);
    ctx.lineTo(nc.x + s, nc.y + s);
    ctx.moveTo(nc.x + s, nc.y - s);
    ctx.lineTo(nc.x - s, nc.y + s);
    ctx.stroke();
  }

  // 7. Hierarchical sheets
  for (const sheet of sch.sheets) {
    drawSheet(ctx, sheet);
  }
}

// ============================================================
// SYMBOL DRAWING
// ============================================================

function drawSymbol(ctx: CanvasRenderingContext2D, symbol: SchematicElement, libSymbols: Map<string, LibSymbol>) {
  const libSym = libSymbols.get(symbol.libId);

  ctx.save();
  ctx.translate(symbol.x, symbol.y);

  // KiCad lib_symbols use Y-up, canvas uses Y-down → base Y-flip
  // Combine mirror + Y-flip into a single scale:
  //   (mirror x) = mirror about X axis = flip Y → cancels Y-flip → sy=+1
  //   (mirror y) = mirror about Y axis = flip X → sx=-1
  let sx = 1, sy = -1; // base Y-flip
  if (symbol.mirror.includes('x')) sy *= -1;
  if (symbol.mirror.includes('y')) sx = -1;

  // Rotation: KiCad stores CCW degrees; canvas rotate(+) = CW on screen
  // With Y-flip, rotation direction is preserved, so negate
  if (symbol.rotation) {
    ctx.rotate((-symbol.rotation * Math.PI) / 180);
  }
  ctx.scale(sx, sy);

  if (libSym) {
    // Draw matching units from lib_symbols
    for (const unit of libSym.units) {
      // Unit 0 = common graphics, then match the placed symbol's unit
      if (unit.unitNum === 0 || unit.unitNum === symbol.unit) {
        // Only show the matching convert (body style)
        if (unit.convertNum === symbol.convert) {
          drawLibGraphics(ctx, unit.graphics);
          drawLibPins(ctx, unit.pins, libSym);
        }
      }
    }
  } else {
    // Fallback: placeholder rectangle (un-flip for text)
    ctx.strokeStyle = '#cba6f7';
    ctx.lineWidth = 0.2;
    ctx.strokeRect(-3, -2, 6, 4);
    ctx.save();
    ctx.scale(1, -1); // un-flip Y for text readability
    ctx.fillStyle = '#f9e2af';
    ctx.font = '1px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol.reference || symbol.libId, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // Draw properties (Reference, Value) at their absolute positions
  drawSymbolProperties(ctx, symbol);
}

function drawSymbolProperties(ctx: CanvasRenderingContext2D, symbol: SchematicElement) {
  for (const [key, prop] of Object.entries(symbol.properties)) {
    if (!prop || !prop.visible || !prop.value) continue;
    // Only show Reference and Value (skip Footprint, Datasheet etc.)
    if (key !== 'Reference' && key !== 'Value') continue;

    ctx.save();
    ctx.translate(prop.x, prop.y);
    // Property rotation is in screen coords (Y-down). KiCad stores CCW degrees.
    if (prop.rotation) ctx.rotate((-prop.rotation * Math.PI) / 180);
    ctx.fillStyle = key === 'Reference' ? '#f9e2af' : '#94e2d5';
    const fontSize = Math.max(prop.fontSize || 1.27, 0.8);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(prop.value, 0, 0);
    ctx.restore();
  }
}

// ============================================================
// LIB SYMBOL GRAPHICS DRAWING
// ============================================================

function drawLibGraphics(ctx: CanvasRenderingContext2D, graphics: LibGraphic[]) {
  for (const g of graphics) {
    const sw = g.strokeWidth > 0 ? g.strokeWidth : 0.15;
    ctx.lineWidth = sw;
    ctx.strokeStyle = '#cba6f7';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (g.type) {
      case 'polyline':
        if (g.points && g.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(g.points[0].x, g.points[0].y);
          for (let i = 1; i < g.points.length; i++) {
            ctx.lineTo(g.points[i].x, g.points[i].y);
          }
          applyFill(ctx, g.fillType);
          ctx.stroke();
        }
        break;

      case 'rectangle':
        if (g.start && g.end) {
          const x = Math.min(g.start.x, g.end.x);
          const y = Math.min(g.start.y, g.end.y);
          const w = Math.abs(g.end.x - g.start.x);
          const h = Math.abs(g.end.y - g.start.y);
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          applyFill(ctx, g.fillType);
          ctx.stroke();
        }
        break;

      case 'circle':
        if (g.center && g.radius) {
          ctx.beginPath();
          ctx.arc(g.center.x, g.center.y, g.radius, 0, Math.PI * 2);
          applyFill(ctx, g.fillType);
          ctx.stroke();
        }
        break;

      case 'arc':
        if (g.arcStart && g.arcEnd && g.arcMid) {
          drawArcFrom3Points(ctx, g.arcStart, g.arcMid, g.arcEnd);
        }
        break;
    }
  }
}

function applyFill(ctx: CanvasRenderingContext2D, fillType: string) {
  if (fillType === 'outline') {
    ctx.fillStyle = '#cba6f7';
    ctx.fill();
  } else if (fillType === 'background') {
    ctx.fillStyle = 'rgba(49, 50, 68, 0.7)';
    ctx.fill();
  }
}

function drawArcFrom3Points(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  mid: { x: number; y: number },
  end: { x: number; y: number },
) {
  const ax = start.x, ay = start.y;
  const bx = mid.x, by = mid.y;
  const cx = end.x, cy = end.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) {
    // Colinear fallback
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    return;
  }

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const radius = Math.sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));

  const startAngle = Math.atan2(ay - uy, ax - ux);
  const endAngle = Math.atan2(cy - uy, cx - ux);

  // Determine arc direction using cross product
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const counterClockwise = cross > 0;

  ctx.beginPath();
  ctx.arc(ux, uy, radius, startAngle, endAngle, counterClockwise);
  ctx.stroke();
}

// ============================================================
// PIN DRAWING
// ============================================================

function drawLibPins(ctx: CanvasRenderingContext2D, pins: LibPin[], libSym: LibSymbol) {
  for (const pin of pins) {
    ctx.save();
    ctx.translate(pin.x, pin.y);

    // Pin rotation: 0=right, 90=up, 180=left, 270=down (in lib Y-up coords)
    if (pin.rotation) {
      ctx.rotate((pin.rotation * Math.PI) / 180);
    }

    // Pin line from origin toward +X by pin.length
    ctx.strokeStyle = '#a6e3a1';
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(pin.length, 0);
    ctx.stroke();

    // Small circle at the connection point (origin)
    ctx.fillStyle = '#a6e3a1';
    ctx.beginPath();
    ctx.arc(0, 0, 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Inverted pin indicator
    if (pin.graphicStyle === 'inverted' || pin.graphicStyle === 'inverted_clock') {
      ctx.strokeStyle = '#cba6f7';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.arc(pin.length - 0.4, 0, 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Pin name (inside the symbol body) — un-flip Y for text
    if (libSym.showPinNames && pin.name && pin.name !== '~') {
      ctx.save();
      ctx.translate(pin.length + libSym.pinNamesOffset + 0.3, 0);
      ctx.scale(1, -1); // un-flip Y for readable text
      ctx.fillStyle = '#94e2d5';
      ctx.font = '1.0px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(pin.name, 0, 0);
      ctx.restore();
    }

    // Pin number (above the line) — un-flip Y for text
    if (libSym.showPinNumbers && pin.number) {
      ctx.save();
      ctx.translate(pin.length / 2, 0.3);
      ctx.scale(1, -1); // un-flip Y for readable text
      ctx.fillStyle = '#f38ba8';
      ctx.font = '0.8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(pin.number, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }
}

// ============================================================
// LABEL DRAWING
// ============================================================

function drawLabel(ctx: CanvasRenderingContext2D, label: { text: string; x: number; y: number; rotation: number; type: string }) {
  ctx.save();
  ctx.translate(label.x, label.y);

  // KiCad label rotation: CCW degrees on screen. Negate for canvas.
  const angleDeg = label.rotation || 0;
  const angleRad = (-angleDeg * Math.PI) / 180;
  if (angleDeg) ctx.rotate(angleRad);

  const colors: Record<string, string> = {
    net: '#89b4fa',
    global: '#f9e2af',
    hierarchical: '#f5c2e7',
  };

  ctx.fillStyle = colors[label.type] || '#89b4fa';
  const fontSize = 1.27;
  ctx.font = `${fontSize}px sans-serif`;

  // Net labels: text above the connection point (offset upward)
  // For KiCad, labels sit at the wire end, text goes in the label direction
  if (label.type === 'net') {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label.text, 0.2, -0.25);

    // Small angled flag line at origin
    ctx.strokeStyle = colors.net;
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -0.5);
    ctx.stroke();
  } else if (label.type === 'global') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label.text).width;
    const pw = w / 2 + 0.5;
    const ph = fontSize * 0.55;

    // Diamond-like shape around the text
    ctx.strokeStyle = colors.global;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(-pw, 0);
    ctx.lineTo(-pw + 0.3, -ph);
    ctx.lineTo(pw - 0.3, -ph);
    ctx.lineTo(pw, 0);
    ctx.lineTo(pw - 0.3, ph);
    ctx.lineTo(-pw + 0.3, ph);
    ctx.closePath();
    ctx.stroke();

    ctx.fillText(label.text, 0, 0);
  } else if (label.type === 'hierarchical') {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label.text).width;
    const ph = fontSize * 0.55;

    // Flag shape
    ctx.strokeStyle = colors.hierarchical;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0.5, -ph);
    ctx.lineTo(w + 1.0, -ph);
    ctx.lineTo(w + 1.0, ph);
    ctx.lineTo(0.5, ph);
    ctx.closePath();
    ctx.stroke();

    ctx.fillText(label.text, 0.6, 0);
  }

  ctx.restore();
}

// ============================================================
// HIERARCHICAL SHEET DRAWING
// ============================================================

function drawSheet(ctx: CanvasRenderingContext2D, sheet: Sheet) {
  // Sheet rectangle with fill — KiCad-like green tint
  ctx.fillStyle = 'rgba(166, 227, 161, 0.06)';
  ctx.fillRect(sheet.x, sheet.y, sheet.width, sheet.height);
  ctx.strokeStyle = '#a6e3a1';
  ctx.lineWidth = 0.2;
  ctx.strokeRect(sheet.x, sheet.y, sheet.width, sheet.height);

  // Sheet name (top-left inside the rect)
  if (sheet.name) {
    ctx.fillStyle = '#89dceb';
    ctx.font = 'bold 1.3px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(sheet.name, sheet.x + 0.5, sheet.y + 0.4);
  }

  // File name (bottom-left inside the rect, smaller)
  if (sheet.fileName) {
    ctx.fillStyle = '#6c7086';
    ctx.font = '0.9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(sheet.fileName, sheet.x + 0.5, sheet.y + sheet.height - 0.3);
  }

  // "Double-click to enter" hint (center)
  ctx.fillStyle = 'rgba(137, 180, 250, 0.3)';
  ctx.font = '0.8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u25B6 double-click', sheet.x + sheet.width / 2, sheet.y + sheet.height / 2);

  // Sheet pins
  for (const pin of sheet.pins) {
    ctx.fillStyle = '#f5c2e7';
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f5c2e7';
    ctx.lineWidth = 0.12;
    const isLeft = Math.abs(pin.x - sheet.x) < 0.5;
    const isRight = Math.abs(pin.x - (sheet.x + sheet.width)) < 0.5;

    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(pin.x, pin.y);
      ctx.lineTo(pin.x + 1.0, pin.y);
    } else if (isRight) {
      ctx.moveTo(pin.x, pin.y);
      ctx.lineTo(pin.x - 1.0, pin.y);
    }
    ctx.stroke();

    ctx.fillStyle = '#f5c2e7';
    ctx.font = '0.9px sans-serif';
    ctx.textBaseline = 'middle';
    if (isLeft) {
      ctx.textAlign = 'left';
      ctx.fillText(pin.name, pin.x + 1.3, pin.y);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(pin.name, pin.x - 1.3, pin.y);
    }
  }
}
