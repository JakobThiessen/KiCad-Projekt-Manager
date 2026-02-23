import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, Layers, Eye, EyeOff, FlipHorizontal2 } from 'lucide-react';
import * as gerberParser from '@tracespace/parser';
import { identifyLayers, TYPE_DRILL, TYPE_DRAWING, SIDE_ALL, SIDE_TOP, SIDE_BOTTOM } from '@tracespace/identify-layers';
import { plot, renderLayers, renderBoard, stringifySvg } from '@tracespace/core';
import type { Layer, RenderLayersResult } from '@tracespace/core';


// Gerber file extensions to look for in the same directory
const GERBER_EXTS = new Set([
  '.gbr', '.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo', '.gtp', '.gbp',
  '.gm1', '.gm2', '.gm3', '.gko', '.drl', '.xln', '.exc', '.g2l', '.g3l',
]);

interface GerberViewerProps {
  content: string;
  filePath: string;
}

interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface LayerInfo extends Layer {
  visible: boolean;
}

function genId(): string {
  return Math.random().toString(36).slice(2);
}

function extractViewBox(svgStr: string): { width: number; height: number } {
  const m = svgStr.match(/viewBox="([^"]+)"/);
  if (!m) return { width: 100, height: 100 };
  const parts = m[1].split(/\s+/).map(Number);
  return { width: parts[2] || 100, height: parts[3] || 100 };
}

async function buildSvgImage(
  renderResult: RenderLayersResult,
  layers: LayerInfo[],
  side: string = SIDE_TOP
): Promise<{ img: HTMLImageElement; dims: { width: number; height: number } } | null> {
  // Filter to only visible layers
  const visibleIds = new Set(layers.filter(l => l.visible).map(l => l.id));
  const visibleResult: RenderLayersResult = {
    ...renderResult,
    layers: renderResult.layers.filter(l => visibleIds.has(l.id)),
  };

  const board = renderBoard(visibleResult);
  const boardSvg = (board as Record<string, unknown>)[side] ?? (board as Record<string, unknown>)[SIDE_TOP];
  if (!boardSvg) return null;

  const svgStr = stringifySvg(boardSvg as Parameters<typeof stringifySvg>[0]);
  const dims = extractViewBox(svgStr);

  return new Promise<{ img: HTMLImageElement; dims: { width: number; height: number } } | null>((resolve) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ img, dims }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

const LAYER_TYPE_LABELS: Record<string, string> = {
  copper: 'Copper',
  soldermask: 'Soldermask',
  silkscreen: 'Silkscreen',
  solderpaste: 'Paste',
  drill: 'Drill',
  outline: 'Outline',
  drawing: 'Drawing',
};

export function GerberViewer({ filePath }: GerberViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<ViewTransform>({ offsetX: 0, offsetY: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layerInfos, setLayerInfos] = useState<LayerInfo[]>([]);
  const [showLayers, setShowLayers] = useState(true);
  const [svgImage, setSvgImage] = useState<HTMLImageElement | null>(null);
  const [svgDims, setSvgDims] = useState({ width: 100, height: 100 });
  const [viewSide, setViewSide] = useState<string>(SIDE_TOP);

  // Stored render result for layer toggling without re-parsing
  const renderResultRef = useRef<RenderLayersResult | null>(null);
  const viewSideRef = useRef<string>(SIDE_TOP);

  // Load all Gerber files in the same directory and render composite
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvgImage(null);
    setLayerInfos([]);

    async function load() {
      try {
        // Determine directory and path separator
        const sep = filePath.includes('\\') ? '\\' : '/';
        const dir = filePath.slice(0, filePath.lastIndexOf(sep));

        // List directory contents
        const allFiles: string[] = await window.api.listDir(dir);

        // Filter to Gerber files
        const gerberFilenames = allFiles.filter((f) => {
          const dot = f.lastIndexOf('.');
          if (dot < 0) return false;
          return GERBER_EXTS.has(f.slice(dot).toLowerCase());
        });

        if (gerberFilenames.length === 0) {
          throw new Error('No Gerber files found in this directory.');
        }

        // Read all file contents in parallel
        const fileContents = await Promise.all(
          gerberFilenames.map(async (filename) => ({
            filename,
            content: await window.api.readFile(`${dir}${sep}${filename}`),
          }))
        );

        if (cancelled) return;

        // Parse with @tracespace/parser
        const parsedLayers = fileContents.map(({ filename, content }) => ({
          id: genId(),
          filename,
          parseTree: gerberParser.parse(content),
        }));

        // Identify layer types from filenames
        const gerberFilenamesOnly = parsedLayers
          .filter((l) => l.parseTree.filetype === gerberParser.GERBER)
          .map((l) => l.filename);
        const identitiesByFilename = identifyLayers(gerberFilenamesOnly);

        // Build ReadResult manually (bypassing @tracespace/core's read() which uses Node.js fs)
        const layers: Layer[] = parsedLayers.map(({ id, filename, parseTree }) => {
          const rawIdentity =
            parseTree.filetype === gerberParser.DRILL
              ? { type: TYPE_DRILL, side: SIDE_ALL }
              : identitiesByFilename[filename] ?? { type: TYPE_DRAWING, side: SIDE_ALL };
          const type = (rawIdentity.type ?? TYPE_DRAWING) as Layer['type'];
          const side = (rawIdentity.side ?? SIDE_ALL) as Layer['side'];
          return { id, filename, type, side };
        });

        const parseTreesById = Object.fromEntries(parsedLayers.map((l) => [l.id, l.parseTree]));

        // Plot and render all layers
        const plotResult = plot({ layers, parseTreesById });
        const renderResult = renderLayers(plotResult);
        renderResultRef.current = renderResult;

        const initialLayerInfos: LayerInfo[] = renderResult.layers.map((l) => ({ ...l, visible: true }));

        if (cancelled) return;
        setViewSide(SIDE_TOP);
        viewSideRef.current = SIDE_TOP;
        setLayerInfos(initialLayerInfos);

        // Build SVG image
        const result = await buildSvgImage(renderResult, initialLayerInfos, SIDE_TOP);
        if (cancelled) return;

        if (!result) {
          throw new Error('Failed to render Gerber composite SVG.');
        }

        // Fit to canvas
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const availH = rect.height - 40; // subtract toolbar height
          const scaleX = rect.width / result.dims.width;
          const scaleY = availH / result.dims.height;
          const fitScale = Math.min(scaleX, scaleY) * 0.92;
          setTransform({ offsetX: 0, offsetY: 0, scale: fitScale });
        }

        setSvgDims(result.dims);
        setSvgImage(result.img);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [filePath]);

  // Draw canvas whenever SVG image or transform changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Dark background
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (svgImage) {
      const drawW = svgDims.width * transform.scale;
      const drawH = svgDims.height * transform.scale;
      const x = rect.width / 2 - drawW / 2 + transform.offsetX;
      const y = rect.height / 2 - drawH / 2 + transform.offsetY;

      if (viewSide === SIDE_BOTTOM) {
        // Mirror horizontally so bottom view looks physically correct
        ctx.save();
        ctx.translate(rect.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(svgImage, rect.width - x - drawW, y, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(svgImage, x, y, drawW, drawH);
      }
    }

    // Info bar
    ctx.fillStyle = '#6c7086';
    ctx.font = '11px "Segoe UI", sans-serif';
    const zoomPct = (transform.scale * 100).toFixed(0);
    ctx.fillText(`Zoom: ${zoomPct}%  |  ${layerInfos.length} layer${layerInfos.length !== 1 ? 's' : ''}  |  ${viewSide === SIDE_BOTTOM ? 'Bottom' : 'Top'} view`, 8, rect.height - 8);
  }, [svgImage, svgDims, transform, layerInfos.length, viewSide]);

  // Redraw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !svgImage) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#11111b';
      ctx.fillRect(0, 0, rect.width, rect.height);
      const drawW = svgDims.width * transform.scale;
      const drawH = svgDims.height * transform.scale;
      const x = rect.width / 2 - drawW / 2 + transform.offsetX;
      const y = rect.height / 2 - drawH / 2 + transform.offsetY;
      if (viewSide === SIDE_BOTTOM) {
        ctx.save();
        ctx.translate(rect.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(svgImage, rect.width - x - drawW, y, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(svgImage, x, y, drawW, drawH);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [svgImage, svgDims, transform, viewSide]);

  // Layer visibility toggle – re-renders SVG with filtered layers
  const handleToggleLayer = useCallback(async (id: string) => {
    const renderResult = renderResultRef.current;
    if (!renderResult) return;
    const updated = layerInfos.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
    setLayerInfos(updated);
    const result = await buildSvgImage(renderResult, updated, viewSideRef.current);
    if (result) {
      setSvgDims(result.dims);
      setSvgImage(result.img);
    }
  }, [layerInfos]);

  // Flip between top and bottom view
  const handleFlipSide = useCallback(async () => {
    const renderResult = renderResultRef.current;
    if (!renderResult) return;
    const newSide = viewSideRef.current === SIDE_TOP ? SIDE_BOTTOM : SIDE_TOP;
    viewSideRef.current = newSide;
    setViewSide(newSide);
    const result = await buildSvgImage(renderResult, layerInfos, newSide);
    if (result) {
      setSvgDims(result.dims);
      setSvgImage(result.img);
    }
  }, [layerInfos]);

  const handleFit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const availH = rect.height - 40;
    const scaleX = rect.width / svgDims.width;
    const scaleY = availH / svgDims.height;
    setTransform({ offsetX: 0, offsetY: 0, scale: Math.min(scaleX, scaleY) * 0.92 });
  }, [svgDims]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.max(0.01, Math.min(2000, t.scale * factor)) }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    setTransform((t) => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
    setLastMouse({ x: e.clientX, y: e.clientY });
  }, [isPanning, lastMouse]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  return (
    <div className="viewer-container" ref={containerRef} style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Toolbar */}
      <div className="toolbar">
        <button className="toolbar-btn" onClick={() => setTransform((t) => ({ ...t, scale: t.scale * 1.3 }))} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="toolbar-btn" onClick={() => setTransform((t) => ({ ...t, scale: t.scale / 1.3 }))} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="toolbar-btn" onClick={handleFit} title="Fit to View">
          <Maximize size={16} />
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button
          className="toolbar-btn"
          onClick={handleFlipSide}
          title={viewSide === SIDE_TOP ? 'Switch to Bottom View' : 'Switch to Top View'}
          style={{ color: viewSide === SIDE_BOTTOM ? 'var(--accent, #89b4fa)' : undefined }}
          disabled={loading}
        >
          <FlipHorizontal2 size={16} />
        </button>
        <span style={{ fontSize: '10px', color: viewSide === SIDE_BOTTOM ? 'var(--accent, #89b4fa)' : 'var(--text-muted)', minWidth: '26px', userSelect: 'none' }}>
          {viewSide === SIDE_TOP ? 'TOP' : 'BOT'}
        </span>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button
          className="toolbar-btn"
          onClick={() => setShowLayers((s) => !s)}
          title="Toggle Layers Panel"
          style={{ color: showLayers ? 'var(--accent, #89b4fa)' : undefined }}
        >
          <Layers size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
          {loading ? 'Loadingâ€¦' : `${layerInfos.length} layer${layerInfos.length !== 1 ? 's' : ''}`}
          {' â€” '}
          {filePath.split(/[/\\]/).pop()}
        </span>
      </div>

      {/* Content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          style={{ flex: 1, cursor: isPanning ? 'grabbing' : 'grab', minWidth: 0 }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Layer panel */}
        {showLayers && !loading && !error && layerInfos.length > 0 && (
          <div
            style={{
              width: '190px',
              background: 'var(--bg-secondary, #1e1e2e)',
              borderLeft: '1px solid var(--border, #313244)',
              overflowY: 'auto',
              padding: '8px 6px',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px', paddingLeft: '4px' }}>
              LAYERS
            </div>
            {layerInfos.map((layer) => (
              <button
                key={layer.id}
                onClick={() => handleToggleLayer(layer.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  color: layer.visible ? 'var(--text, #cdd6f4)' : 'var(--text-muted, #6c7086)',
                  textAlign: 'left',
                  fontSize: '11px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #313244)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                title={layer.filename}
              >
                {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {layer.filename}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted, #6c7086)' }}>
                    {LAYER_TYPE_LABELS[layer.type ?? ''] ?? layer.type ?? 'Unknown'} Â· {layer.side}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(17,17,27,0.85)',
            color: 'var(--text-muted, #6c7086)',
            fontSize: '13px',
            gap: '10px',
          }}
        >
          <div style={{ width: 24, height: 24, border: '2px solid #313244', borderTopColor: '#89b4fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Loading Gerber layersâ€¦
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#11111b',
            color: '#f38ba8',
            padding: '32px',
            textAlign: 'center',
            fontSize: '13px',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '16px' }}>!</span>
          {error}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
