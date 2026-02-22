import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Point PDF.js to the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  filePath: string;
}

export function PdfViewer({ filePath }: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [fitScale, setFitScale] = useState<number>(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Load PDF from file via IPC (works in both dev and production)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setCurrentPage(1);

    window.api.readFileBase64(filePath)
      .then(async (base64: string) => {
        if (cancelled) return;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) { setError(String(err)); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [filePath]);

  // Compute fit-width scale whenever the PDF or container size changes
  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;

    const computeFit = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current!.clientWidth - 32; // 16px padding each side
      const computed = Math.max(0.25, containerWidth / viewport.width);
      setFitScale(computed);
      setScale(computed);
    };

    computeFit();

    const observer = new ResizeObserver(() => {
      if (!pdfDoc || !containerRef.current) return;
      pdfDoc.getPage(currentPage).then(page => {
        const viewport = page.getViewport({ scale: 1 });
        const containerWidth = containerRef.current!.clientWidth - 32;
        const computed = Math.max(0.25, containerWidth / viewport.width);
        setFitScale(computed);
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pdfDoc, currentPage]);

  // Render the current page to canvas whenever page or scale changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    pdfDoc.getPage(currentPage).then(page => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      task.promise.catch(err => {
        if (err?.name !== 'RenderingCancelledException') console.error('PDF render:', err);
      });
    });

    return () => {
      cancelled = true;
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    };
  }, [pdfDoc, currentPage, scale]);

  if (loading) return (
    <div className="pdf-viewer-loading">
      <div className="spinner" />
      <span>Loading PDF…</span>
    </div>
  );

  if (error) return (
    <div className="pdf-viewer-error">
      <p>Failed to load PDF</p>
      <p style={{ fontSize: '12px', opacity: 0.7 }}>{error}</p>
      <button className="pdf-viewer-open-btn" onClick={() => window.api.openInDefaultApp(filePath)}>
        Open in default PDF viewer
      </button>
    </div>
  );

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-toolbar">
        <button className="pdf-viewer-nav-btn" disabled={currentPage <= 1}
          onClick={() => setCurrentPage(p => p - 1)}>‹</button>
        <span className="pdf-viewer-page-info">{currentPage} / {numPages}</span>
        <button className="pdf-viewer-nav-btn" disabled={currentPage >= numPages}
          onClick={() => setCurrentPage(p => p + 1)}>›</button>
        <div className="pdf-viewer-sep" />
        <button className="pdf-viewer-nav-btn" onClick={() => setScale(s => Math.max(0.25, +(s - 0.25).toFixed(2)))}>−</button>
        <span className="pdf-viewer-page-info">{Math.round(scale * 100)}%</span>
        <button className="pdf-viewer-nav-btn" onClick={() => setScale(s => Math.min(4, +(s + 0.25).toFixed(2)))}>+</button>
        <button className="pdf-viewer-nav-btn" title="Auf Breite einpassen" onClick={() => setScale(fitScale)}>⊡</button>
        <div className="pdf-viewer-sep" />
        <button className="pdf-viewer-open-btn" onClick={() => window.api.openInDefaultApp(filePath)}>
          Extern öffnen
        </button>
      </div>
      <div className="pdf-viewer-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="pdf-viewer-canvas" />
      </div>
    </div>
  );
}
