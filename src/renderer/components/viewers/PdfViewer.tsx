import React, { useEffect, useState, useRef } from 'react';

interface PdfViewerProps {
  filePath: string;
}

export function PdfViewer({ filePath }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    window.api.readFileBase64(filePath)
      .then(base64 => {
        if (cancelled) return;
        // Convert base64 to Blob URL
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // Revoke previous URL to avoid memory leak
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

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevUrl.current) {
        URL.revokeObjectURL(prevUrl.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="pdf-viewer-loading">
        <div className="spinner" />
        <span>Loading PDF…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-viewer-error">
        <p>Failed to load PDF</p>
        <p style={{ fontSize: '12px', opacity: 0.7 }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <object
        data={blobUrl ?? ''}
        type="application/pdf"
        className="pdf-viewer-object"
      >
        <div className="pdf-viewer-error">
          <p>PDF preview not available.</p>
          <button
            className="pdf-viewer-open-btn"
            onClick={() => window.api.openInDefaultApp(filePath)}
          >
            Open in default PDF viewer
          </button>
        </div>
      </object>
    </div>
  );
}
