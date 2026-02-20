import React, { useEffect, useState, useRef } from 'react';

interface ImageViewerProps {
  filePath: string;
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'ico': return 'image/x-icon';
    default: return 'image/png';
  }
}

export function ImageViewer({ filePath }: ImageViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setZoom(1);

    window.api.readFileBase64(filePath)
      .then(base64 => {
        if (cancelled) return;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: getMimeType(filePath) });
        const url = URL.createObjectURL(blob);

        if (prevUrl.current) {
          URL.revokeObjectURL(prevUrl.current);
        }
        prevUrl.current = url;
        setBlobUrl(url);
      })
      .catch(err => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filePath]);

  useEffect(() => {
    return () => {
      if (prevUrl.current) {
        URL.revokeObjectURL(prevUrl.current);
      }
    };
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom(z => Math.min(Math.max(z + (e.deltaY > 0 ? -0.1 : 0.1), 0.1), 10));
    }
  };

  const fileName = filePath.split(/[/\\]/).pop() || '';

  if (loading) {
    return (
      <div className="image-viewer-loading">
        <div className="spinner" />
        <span>Loading image…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="image-viewer-error">
        <p>Failed to load image</p>
        <p style={{ fontSize: '12px', opacity: 0.7 }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="image-viewer">
      <div className="toolbar">
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px' }}>
          {fileName}
          {naturalSize && ` — ${naturalSize.w}×${naturalSize.h}`}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px' }}>
          {Math.round(zoom * 100)}% — Ctrl+Scroll to zoom
        </span>
      </div>
      <div className="image-viewer-canvas" onWheel={handleWheel}>
        <img
          src={blobUrl ?? ''}
          alt={fileName}
          draggable={false}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      </div>
    </div>
  );
}
