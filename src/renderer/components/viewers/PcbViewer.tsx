/**
 * PcbViewer — canvas-based KiCad PCB renderer.
 *
 * Renders tracks, vias, pads, footprint graphics, board outline,
 * zones, and graphic items with layer-based coloring.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { KicadPcbParser, type PcbData, type PcbFootprint, type FpGraphic, type BoardLine, type PcbZone } from '../../parser/pcbParser';
import { Eye, EyeOff, ZoomIn, ZoomOut, SquareDashedBottom, Layers, X } from 'lucide-react';import { useAppStore } from '../../store/appStore';
// ─── Layer colours (Catppuccin accents) ────────────────────────────────
const LAYER_COLORS: Record<string, string> = {
  'F.Cu':      '#f38ba8',
  'In1.Cu':    '#f9e2af',
  'In2.Cu':    '#a6e3a1',
  'In3.Cu':    '#89dceb',
  'In4.Cu':    '#cba6f7',
  'In5.Cu':    '#fab387',
  'In6.Cu':    '#94e2d5',
  'In7.Cu':    '#f5c2e7',
  'In8.Cu':    '#74c7ec',
  'In9.Cu':    '#eba0ac',
  'In10.Cu':   '#b4befe',
  'In11.Cu':   '#f9e2af',
  'In12.Cu':   '#a6e3a1',
  'In13.Cu':   '#89dceb',
  'In14.Cu':   '#cba6f7',
  'In15.Cu':   '#fab387',
  'In16.Cu':   '#94e2d5',
  'In17.Cu':   '#f5c2e7',
  'In18.Cu':   '#74c7ec',
  'In19.Cu':   '#eba0ac',
  'In20.Cu':   '#b4befe',
  'In21.Cu':   '#f9e2af',
  'In22.Cu':   '#a6e3a1',
  'In23.Cu':   '#89dceb',
  'In24.Cu':   '#cba6f7',
  'In25.Cu':   '#fab387',
  'In26.Cu':   '#94e2d5',
  'In27.Cu':   '#f5c2e7',
  'In28.Cu':   '#74c7ec',
  'In29.Cu':   '#eba0ac',
  'In30.Cu':   '#b4befe',
  'B.Cu':      '#89b4fa',
  'F.SilkS':   '#f5c2e7',
  'B.SilkS':   '#74c7ec',
  'F.Mask':    '#f9e2af40',
  'B.Mask':    '#94e2d540',
  'F.Paste':   '#cba6f740',
  'B.Paste':   '#b4befe40',
  'F.Fab':     '#a6adc8',
  'B.Fab':     '#7f849c',
  'F.CrtYd':   '#a6e3a1',
  'B.CrtYd':   '#a6e3a180',
  'Edge.Cuts':  '#f5e0dc',
  'Dwgs.User':  '#bac2de',
  'Cmts.User':  '#6c7086',
  'User.1':    '#bac2de',
  'User.2':    '#6c7086',
};

const DEFAULT_VISIBLE = new Set([
  'F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS', 'F.Fab', 'B.Fab',
  'F.CrtYd', 'B.CrtYd', 'Edge.Cuts', 'F.Mask', 'B.Mask',
  // Internal layers will be added dynamically after parsing
]);

function layerColor(name: string): string {
  if (LAYER_COLORS[name]) return LAYER_COLORS[name];
  // Generate a consistent color for unknown layers
  if (name.endsWith('.Cu')) {
    const match = name.match(/^In(\d+)\.Cu$/);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      const hue = (idx * 37) % 360;
      return `hsl(${hue}, 70%, 65%)`;
    }
  }
  return '#585b70';
}

// ─── Component ─────────────────────────────────────────────────────────
interface Props { content: string; filePath: string }

export function PcbViewer({ content, filePath }: Props) {
  const theme = useAppStore(s => s.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pcb, setPcb] = useState<PcbData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState(new Set(DEFAULT_VISIBLE));
  const autoFitDone = useRef(false);

  // Pan / zoom state stored in ref so the render loop doesn't need React state
  const transform = useRef({ offsetX: 0, offsetY: 0, scale: 3 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // ── Load & parse ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!content || !content.trim()) return;
    let cancelled = false;
    autoFitDone.current = false;
    try {
      const parser = new KicadPcbParser();
      const data = parser.parse(content);
      if (!cancelled) {
        setPcb(data);
        setError(null);
        // Auto-enable all copper and Edge.Cuts layers from the PCB
        setVisibleLayers(prev => {
          const next = new Set(prev);
          for (const l of data.layers) {
            if (l.name.endsWith('.Cu') || l.name === 'Edge.Cuts') {
              next.add(l.name);
            }
          }
          return next;
        });
      }
    } catch (e: any) {
      if (!cancelled) { setPcb(null); setError(e.message); }
      console.error('Failed to parse PCB:', e);
    }
    return () => { cancelled = true; };
  }, [content]);

  // ── Calculate bounds helper ──────────────────────────────────────────
  const calculateBounds = useCallback((data: PcbData) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x: number, y: number, m = 0) => {
      minX = Math.min(minX, x - m); minY = Math.min(minY, y - m);
      maxX = Math.max(maxX, x + m); maxY = Math.max(maxY, y + m);
    };
    for (const bl of data.boardOutline) {
      expand(bl.startX, bl.startY, 2);
      expand(bl.endX, bl.endY, 2);
      if (bl.midX != null && bl.midY != null) expand(bl.midX, bl.midY, 2);
    }
    for (const fp of data.footprints) {
      expand(fp.x, fp.y, 5);
      for (const pad of fp.pads) expand(fp.x + pad.x, fp.y + pad.y, Math.max(pad.sizeX, pad.sizeY) / 2);
    }
    for (const t of data.tracks) { expand(t.startX, t.startY); expand(t.endX, t.endY); }
    for (const v of data.vias) expand(v.x, v.y, v.size / 2);
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }, []);

  // ── Auto-fit on first parse ──────────────────────────────────────────
  useEffect(() => {
    if (!pcb || !canvasRef.current || autoFitDone.current) return;
    autoFitDone.current = true;
    const bounds = calculateBounds(pcb);
    if (!bounds) return;
    const canvas = canvasRef.current;
    const cw = canvas.width / devicePixelRatio;
    const ch = canvas.height / devicePixelRatio;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    if (contentW <= 0 || contentH <= 0) return;
    const pad = 0.85;
    const s = Math.min((cw * pad) / contentW, (ch * pad) / contentH);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    transform.current = { offsetX: -cx * s, offsetY: -cy * s, scale: s };
    requestDraw();
  }, [pcb, calculateBounds]);

  // ── Resize handling ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      const dpr = devicePixelRatio;
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      requestDraw();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Draw helpers ─────────────────────────────────────────────────────
  const drawRequest = useRef(0);
  const drawRef = useRef<() => void>(() => {});

  const requestDraw = useCallback(() => {
    cancelAnimationFrame(drawRequest.current);
    drawRequest.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  // Trigger redraw on data / layer changes
  useEffect(() => { requestDraw(); }, [pcb, visibleLayers, showGrid, requestDraw, theme]);

  // ── Main draw ────────────────────────────────────────────────────────
  // Keep drawRef always pointing to the latest closure
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const { offsetX, offsetY, scale } = transform.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme === 'dark' ? '#1e1e2e' : '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (showGrid) drawDotGrid(ctx, w, h, offsetX, offsetY, scale, theme === 'dark' ? '#31324460' : 'rgba(0,0,0,0.12)');

    ctx.save();
    ctx.translate(w / 2 + offsetX, h / 2 + offsetY);
    ctx.scale(scale, scale);

    if (pcb) {
      drawZones(ctx, pcb.zones, visibleLayers);
      drawBoardOutline(ctx, pcb.boardOutline, visibleLayers);
      drawGraphicItems(ctx, pcb.graphicItems, visibleLayers);
      for (const fp of pcb.footprints) drawFootprint(ctx, fp, visibleLayers, scale, theme === 'dark' ? '#1e1e2e' : '#ffffff');
      drawTracks(ctx, pcb.tracks, visibleLayers);
      drawVias(ctx, pcb.vias, visibleLayers, theme === 'dark' ? '#1e1e2e' : '#ffffff');
    }
    ctx.restore();
  }, [pcb, visibleLayers, showGrid, theme]);
  drawRef.current = draw;

  // ── Mouse interaction (native listeners for non-passive wheel) ──────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = transform.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = t.scale * factor;
      t.offsetX = mx - (mx - t.offsetX) * (ns / t.scale);
      t.offsetY = my - (my - t.offsetY) * (ns / t.scale);
      t.scale = ns;
      requestDraw();
    };

    const onDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 0) {
        dragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      transform.current.offsetX += dx;
      transform.current.offsetY += dy;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      requestDraw();
    };
    const onUp = () => { dragging.current = false; };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [requestDraw]);

  // ── Layer toggle ─────────────────────────────────────────────────────
  const toggleLayer = (name: string) => {
    setVisibleLayers(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // ── UI ───────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ padding: 24, color: '#f38ba8' }}>
      <h3>PCB Parse Error</h3><pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
    </div>
  );

  const allLayers = pcb
    ? pcb.layers.map(l => l.name)
    : Object.keys(LAYER_COLORS);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: dragging.current ? 'grabbing' : 'grab' }} />

      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4,
        background: theme === 'dark' ? '#181825cc' : '#e6e9efcc', borderRadius: 6, padding: '4px 6px',
      }}>
        <ToolBtn title="Zoom In" onClick={() => { transform.current.scale *= 1.25; requestDraw(); }}><ZoomIn size={16} /></ToolBtn>
        <ToolBtn title="Zoom Out" onClick={() => { transform.current.scale /= 1.25; requestDraw(); }}><ZoomOut size={16} /></ToolBtn>
        <ToolBtn title="Toggle Grid" onClick={() => setShowGrid(g => !g)}><SquareDashedBottom size={16} /></ToolBtn>
        <ToolBtn title="Layers" onClick={() => setShowLayerPanel(v => !v)}><Layers size={16} /></ToolBtn>
      </div>

      {/* Layer panel */}
      {showLayerPanel && (
        <div style={{
          position: 'absolute', top: 44, right: 8, width: 180, maxHeight: '70%', overflowY: 'auto',
          background: theme === 'dark' ? '#181825ee' : '#e6e9efee', borderRadius: 8, padding: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>Layers</span>
            <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowLayerPanel(false)} />
          </div>
          {allLayers.map(name => (
            <div key={name} onClick={() => toggleLayer(name)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', cursor: 'pointer',
              borderRadius: 4, fontSize: 11, color: visibleLayers.has(name) ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: layerColor(name), display: 'inline-block', opacity: visibleLayers.has(name) ? 1 : 0.3 }} />
              {visibleLayers.has(name) ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toolbar button ────────────────────────────────────────────────────
function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} style={{
      background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4,
      borderRadius: 4, display: 'flex', alignItems: 'center',
    }}>{children}</button>
  );
}

// ─── Drawing helpers ───────────────────────────────────────────────────

function drawDotGrid(ctx: CanvasRenderingContext2D, w: number, h: number, ox: number, oy: number, scale: number, dotColor = '#31324460') {
  const gridMm = scale > 4 ? 0.5 : scale > 1.5 ? 1 : 2.54;
  const gs = gridMm * scale;
  if (gs < 6) return;
  ctx.fillStyle = dotColor;
  const cx = w / 2 + ox;
  const cy = h / 2 + oy;
  const startX = cx % gs;
  const startY = cy % gs;
  for (let x = startX; x < w; x += gs) {
    for (let y = startY; y < h; y += gs) {
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  }
}

function drawBoardOutline(ctx: CanvasRenderingContext2D, outline: BoardLine[], visible: Set<string>) {
  if (!visible.has('Edge.Cuts')) return;
  ctx.strokeStyle = layerColor('Edge.Cuts');
  ctx.lineWidth = 0.15;
  ctx.lineCap = 'round';
  for (const bl of outline) {
    switch (bl.type) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(bl.startX, bl.startY);
        ctx.lineTo(bl.endX, bl.endY);
        ctx.stroke();
        break;
      case 'arc':
        if (bl.midX != null && bl.midY != null) {
          drawArcFrom3Points(ctx,
            { x: bl.startX, y: bl.startY },
            { x: bl.midX, y: bl.midY },
            { x: bl.endX, y: bl.endY },
          );
          ctx.stroke();
        }
        break;
      case 'circle': {
        const r = Math.sqrt((bl.endX - bl.startX) ** 2 + (bl.endY - bl.startY) ** 2);
        ctx.beginPath();
        ctx.arc(bl.startX, bl.startY, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'poly':
        if (bl.points && bl.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(bl.points[0].x, bl.points[0].y);
          for (let i = 1; i < bl.points.length; i++) {
            ctx.lineTo(bl.points[i].x, bl.points[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
        break;
    }
  }
}

function drawGraphicItems(ctx: CanvasRenderingContext2D, items: BoardLine[], visible: Set<string>) {
  for (const it of items) {
    if (!visible.has(it.layer)) continue;
    ctx.strokeStyle = layerColor(it.layer);
    ctx.lineWidth = it.width || 0.1;
    ctx.lineCap = 'round';
    switch (it.type) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(it.startX, it.startY);
        ctx.lineTo(it.endX, it.endY);
        ctx.stroke();
        break;
      case 'arc':
        if (it.midX != null && it.midY != null) {
          drawArcFrom3Points(ctx,
            { x: it.startX, y: it.startY },
            { x: it.midX, y: it.midY },
            { x: it.endX, y: it.endY },
          );
          ctx.stroke();
        }
        break;
      case 'circle': {
        const r = Math.sqrt((it.endX - it.startX) ** 2 + (it.endY - it.startY) ** 2);
        ctx.beginPath();
        ctx.arc(it.startX, it.startY, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'poly':
        if (it.points && it.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(it.points[0].x, it.points[0].y);
          for (let i = 1; i < it.points.length; i++) {
            ctx.lineTo(it.points[i].x, it.points[i].y);
          }
          ctx.closePath();
          if (it.fill === 'solid') {
            ctx.fillStyle = layerColor(it.layer);
            ctx.fill();
          }
          ctx.stroke();
        }
        break;
    }
  }
}

function drawTracks(ctx: CanvasRenderingContext2D, tracks: import('../../parser/pcbParser').PcbTrack[], visible: Set<string>) {
  ctx.lineCap = 'round';
  for (const t of tracks) {
    if (!visible.has(t.layer)) continue;
    ctx.strokeStyle = layerColor(t.layer);
    ctx.lineWidth = t.width;
    ctx.beginPath();
    ctx.moveTo(t.startX, t.startY);
    ctx.lineTo(t.endX, t.endY);
    ctx.stroke();
  }
}

function drawVias(ctx: CanvasRenderingContext2D, vias: import('../../parser/pcbParser').PcbVia[], visible: Set<string>, bgColor = '#1e1e2e') {
  for (const v of vias) {
    const show = v.layers.some(l => visible.has(l));
    if (!show) continue;
    // Outer annular ring
    ctx.fillStyle = '#a6adc880';
    ctx.beginPath();
    ctx.arc(v.x, v.y, v.size / 2, 0, Math.PI * 2);
    ctx.fill();
    // Drill hole
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(v.x, v.y, v.drill / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawZones(ctx: CanvasRenderingContext2D, zones: PcbZone[], visible: Set<string>) {
  for (const z of zones) {
    if (!visible.has(z.layer) || z.points.length < 3) continue;
    const color = layerColor(z.layer);
    ctx.fillStyle = hexToRgba(color, 0.05);
    ctx.strokeStyle = hexToRgba(color, 0.12);
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(z.points[0].x, z.points[0].y);
    for (let i = 1; i < z.points.length; i++) ctx.lineTo(z.points[i].x, z.points[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawFootprint(ctx: CanvasRenderingContext2D, fp: PcbFootprint, visible: Set<string>, viewScale: number, bgColor = '#1e1e2e') {
  ctx.save();
  ctx.translate(fp.x, fp.y);
  if (fp.rotation) ctx.rotate(fp.rotation * Math.PI / 180);

  // Footprint graphics (fp_line, fp_rect, fp_circle, fp_arc, fp_poly)
  for (const g of fp.graphics) {
    if (!visible.has(g.layer)) continue;
    ctx.strokeStyle = layerColor(g.layer);
    ctx.lineWidth = g.width || 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (g.type) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(g.startX!, g.startY!);
        ctx.lineTo(g.endX!, g.endY!);
        ctx.stroke();
        break;
      case 'rect': {
        const x = Math.min(g.startX!, g.endX!);
        const y = Math.min(g.startY!, g.endY!);
        const w = Math.abs(g.endX! - g.startX!);
        const h = Math.abs(g.endY! - g.startY!);
        if (g.fill === 'solid') {
          ctx.fillStyle = layerColor(g.layer);
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'circle':
        ctx.beginPath();
        ctx.arc(g.centerX!, g.centerY!, g.radius!, 0, Math.PI * 2);
        if (g.fill === 'solid') { ctx.fillStyle = layerColor(g.layer); ctx.fill(); }
        ctx.stroke();
        break;
      case 'arc':
        if (g.arcStartX != null && g.arcMidX != null && g.arcEndX != null) {
          drawArcFrom3Points(ctx,
            { x: g.arcStartX, y: g.arcStartY! },
            { x: g.arcMidX, y: g.arcMidY! },
            { x: g.arcEndX, y: g.arcEndY! },
          );
          ctx.stroke();
        }
        break;
      case 'poly':
        if (g.points && g.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(g.points[0].x, g.points[0].y);
          for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
          ctx.closePath();
          if (g.fill === 'solid') { ctx.fillStyle = layerColor(g.layer); ctx.fill(); }
          ctx.stroke();
        }
        break;
    }
  }

  // Pads
  for (const pad of fp.pads) {
    const padLayers = pad.layers;
    const show = padLayers.some(l => visible.has(l));
    if (!show) continue;
    const pcolor = padLayers.includes('F.Cu') ? layerColor('F.Cu') : layerColor('B.Cu');

    ctx.save();
    ctx.translate(pad.x, pad.y);
    if (pad.rotation) ctx.rotate(pad.rotation * Math.PI / 180);

    const hw = pad.sizeX / 2;
    const hh = pad.sizeY / 2;

    ctx.fillStyle = hexToRgba(pcolor, 0.65);
    ctx.strokeStyle = pcolor;
    ctx.lineWidth = 0.08;

    switch (pad.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, hw, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        break;
      case 'oval': {
        const r = Math.min(hw, hh);
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, pad.sizeX, pad.sizeY, r);
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'roundrect': {
        const r = Math.min(hw, hh) * pad.roundrectRatio;
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, pad.sizeX, pad.sizeY, r);
        ctx.fill(); ctx.stroke();
        break;
      }
      default: // rect, trapezoid, custom
        ctx.fillRect(-hw, -hh, pad.sizeX, pad.sizeY);
        ctx.strokeRect(-hw, -hh, pad.sizeX, pad.sizeY);
    }

    // Drill hole for through-hole pads
    if (pad.drill > 0) {
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.arc(0, 0, pad.drill / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pad number
    if (viewScale > 3 && pad.number) {
      const fontSize = Math.min(pad.sizeX, pad.sizeY) * 0.5;
      if (fontSize * viewScale > 2) {
        ctx.fillStyle = bgColor;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pad.number, 0, 0);
      }
    }

    ctx.restore();
  }

  // Footprint text (reference/value)
  for (const t of fp.texts) {
    if (!t.visible || !visible.has(t.layer)) continue;
    ctx.fillStyle = layerColor(t.layer);
    const fontSize = Math.max(t.fontSize * 0.8, 0.5);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(t.x, t.y);
    if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

// ─── Arc from 3 points ────────────────────────────────────────────────
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
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); return;
  }
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const radius = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);
  const startAngle = Math.atan2(ay - uy, ax - ux);
  const endAngle = Math.atan2(cy - uy, cx - ux);
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  ctx.beginPath();
  ctx.arc(ux, uy, radius, startAngle, endAngle, cross > 0);
}

// ─── Color helper ─────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').slice(0, 6);
  const r = parseInt(raw.substring(0, 2), 16);
  const g = parseInt(raw.substring(2, 4), 16);
  const b = parseInt(raw.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
