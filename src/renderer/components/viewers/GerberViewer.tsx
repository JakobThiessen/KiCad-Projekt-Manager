import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, Layers, Eye, EyeOff } from 'lucide-react';

interface GerberViewerProps {
  content: string;
  filePath: string;
}

interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

// Simple Gerber RS-274X parser (basic subset)
interface GerberCommand {
  type: 'move' | 'draw' | 'flash' | 'region-start' | 'region-end';
  x: number;
  y: number;
  aperture?: number;
}

interface GerberData {
  commands: GerberCommand[];
  apertures: Map<number, { shape: string; params: number[] }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function parseGerber(content: string): GerberData {
  const commands: GerberCommand[] = [];
  const apertures = new Map<number, { shape: string; params: number[] }>();
  let currentAperture = 10;
  let currentX = 0;
  let currentY = 0;
  let interpolation: 'linear' | 'cw' | 'ccw' = 'linear';
  const formatXInt = 2, formatXDec = 4;
  const formatYInt = 2, formatYDec = 4;
  let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  const lines = content.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%') && trimmed !== '%') {
      // Handle aperture definitions: %ADD10C,0.1*%
      const adMatch = trimmed.match(/%ADD(\d+)([A-Z]+),?([\d.X]+)?\*%/);
      if (adMatch) {
        const code = parseInt(adMatch[1]);
        const shape = adMatch[2];
        const params = adMatch[3] ? adMatch[3].split('X').map(Number) : [];
        apertures.set(code, { shape, params });
      }
      continue;
    }

    // Aperture select: D10*
    const dMatch = trimmed.match(/^D(\d+)\*$/);
    if (dMatch) {
      currentAperture = parseInt(dMatch[1]);
      continue;
    }

    // Coordinate + operation: X123Y456D01*
    const coordMatch = trimmed.match(/^(?:X(-?\d+))?(?:Y(-?\d+))?(?:D0([123]))\*$/);
    if (coordMatch) {
      if (coordMatch[1]) currentX = parseInt(coordMatch[1]) / Math.pow(10, formatXDec);
      if (coordMatch[2]) currentY = parseInt(coordMatch[2]) / Math.pow(10, formatYDec);
      
      const op = parseInt(coordMatch[3]);
      let type: GerberCommand['type'] = 'draw';
      if (op === 1) type = 'draw';
      else if (op === 2) type = 'move';
      else if (op === 3) type = 'flash';

      commands.push({ type, x: currentX, y: currentY, aperture: currentAperture });
      
      bounds.minX = Math.min(bounds.minX, currentX);
      bounds.minY = Math.min(bounds.minY, currentY);
      bounds.maxX = Math.max(bounds.maxX, currentX);
      bounds.maxY = Math.max(bounds.maxY, currentY);
    }

    // G36/G37 region
    if (trimmed === 'G36*') commands.push({ type: 'region-start', x: 0, y: 0 });
    if (trimmed === 'G37*') commands.push({ type: 'region-end', x: 0, y: 0 });
  }

  if (!isFinite(bounds.minX)) bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  return { commands, apertures, bounds };
}

export function GerberViewer({ content, filePath }: GerberViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<ViewTransform>({ offsetX: 0, offsetY: 0, scale: 5 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [gerber, setGerber] = useState<GerberData | null>(null);

  useEffect(() => {
    try {
      const parsed = parseGerber(content);
      setGerber(parsed);
    } catch (err) {
      console.error('Failed to parse Gerber:', err);
    }
  }, [content]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !gerber) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Dark background
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(rect.width / 2 + transform.offsetX, rect.height / 2 + transform.offsetY);
    ctx.scale(transform.scale, -transform.scale); // Flip Y for Gerber convention

    // Center on data
    const cx = (gerber.bounds.minX + gerber.bounds.maxX) / 2;
    const cy = (gerber.bounds.minY + gerber.bounds.maxY) / 2;
    ctx.translate(-cx, -cy);

    // Draw Gerber
    ctx.strokeStyle = '#a6e3a1';
    ctx.fillStyle = '#a6e3a1';
    ctx.lineWidth = 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let lastX = 0, lastY = 0;
    let inRegion = false;

    for (const cmd of gerber.commands) {
      switch (cmd.type) {
        case 'move':
          lastX = cmd.x;
          lastY = cmd.y;
          break;
        case 'draw':
          // Get aperture width
          const ap = gerber.apertures.get(cmd.aperture || 10);
          const width = ap?.params[0] || 0.1;
          
          if (!inRegion) {
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(cmd.x, cmd.y);
            ctx.stroke();
          }
          lastX = cmd.x;
          lastY = cmd.y;
          break;
        case 'flash': {
          const flashAp = gerber.apertures.get(cmd.aperture || 10);
          if (flashAp) {
            ctx.beginPath();
            if (flashAp.shape === 'C') {
              ctx.arc(cmd.x, cmd.y, (flashAp.params[0] || 0.1) / 2, 0, Math.PI * 2);
              ctx.fill();
            } else if (flashAp.shape === 'R') {
              const w = flashAp.params[0] || 0.1;
              const h = flashAp.params[1] || w;
              ctx.fillRect(cmd.x - w / 2, cmd.y - h / 2, w, h);
            }
          }
          lastX = cmd.x;
          lastY = cmd.y;
          break;
        }
        case 'region-start':
          inRegion = true;
          break;
        case 'region-end':
          inRegion = false;
          break;
      }
    }

    ctx.restore();

    // Info
    ctx.fillStyle = '#6c7086';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(`Zoom: ${(transform.scale * 100).toFixed(0)}%  |  ${gerber.commands.length} commands`, 8, rect.height - 8);
  }, [gerber, transform]);

  useEffect(() => {
    requestAnimationFrame(render);
  }, [render]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(render));
    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({ ...t, scale: Math.max(0.1, Math.min(200, t.scale * delta)) }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setTransform(t => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  }, [isPanning, lastMouse]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  return (
    <div className="viewer-container" ref={containerRef}>
      <div className="toolbar">
        <button className="toolbar-btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale * 1.3 }))} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="toolbar-btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale / 1.3 }))} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="toolbar-btn" onClick={() => setTransform({ offsetX: 0, offsetY: 0, scale: 5 })} title="Fit">
          <Maximize size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
          Gerber Viewer — {filePath.split(/[/\\]/).pop()}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
