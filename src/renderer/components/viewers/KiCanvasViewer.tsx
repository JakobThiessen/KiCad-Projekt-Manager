/**
 * KiCanvasViewer — wraps the KiCanvas web-component (<kicanvas-embed>)
 * for offline use. kicanvas.js is bundled locally in /public/kicanvas.js.
 *
 * Supports KiCad 6, 7, 8, 9 (.kicad_sch / .kicad_pcb).
 * KiCad 5 and legacy formats are detected early and shown as a copyable error.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, CheckCheck } from 'lucide-react';

// ── TypeScript declarations for the KiCanvas web components ──────────
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'kicanvas-embed': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        controls?: string;
        controlslist?: string;
        theme?: string;
      }, HTMLElement>;
      'kicanvas-source': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// ── Script loader (singleton) ─────────────────────────────────────────
let scriptState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
const scriptCallbacks: Array<(ok: boolean) => void> = [];

function loadKiCanvasScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (scriptState === 'ready') { resolve(true); return; }
    if (scriptState === 'error') { resolve(false); return; }

    scriptCallbacks.push(resolve);

    if (scriptState === 'loading') return;
    scriptState = 'loading';

    const script = document.createElement('script');
    script.type = 'module';
    script.src = './kicanvas.js';
    script.onload = () => {
      scriptState = 'ready';
      scriptCallbacks.forEach(cb => cb(true));
      scriptCallbacks.length = 0;
    };
    script.onerror = () => {
      scriptState = 'error';
      scriptCallbacks.forEach(cb => cb(false));
      scriptCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

// ── KiCad 5 / legacy format detection ────────────────────────────────
interface FormatInfo {
  isLegacy: boolean;
  reason: string;
}

function detectFormat(content: string, filePath: string): FormatInfo {
  const trimmed = content.trimStart();

  // KiCad 5 schematic — plain text, starts with EESchema
  if (trimmed.startsWith('EESchema')) {
    return {
      isLegacy: true,
      reason:
        'Diese Datei ist ein KiCad 5 Schaltplan (EESchema-Format).\n' +
        'KiCanvas unterstützt nur KiCad 6 und neuer.\n\n' +
        `Datei: ${filePath}\n` +
        'Formatkennung: EESchema (Legacy .sch)',
    };
  }

  // KiCad 5 PCB — plain text, starts with (kicad_pcb (version N) with N < 20210000
  const pcbVerMatch = trimmed.match(/^\(kicad_pcb\s+\(version\s+(\d+)/);
  if (pcbVerMatch) {
    const ver = parseInt(pcbVerMatch[1], 10);
    if (ver < 20210000) {
      return {
        isLegacy: true,
        reason:
          `Diese PCB-Datei verwendet das Legacy-Format (Version ${ver}).\n` +
          'KiCanvas unterstützt nur KiCad 6+ Format (Version ≥ 20210000).\n\n' +
          `Datei: ${filePath}\n` +
          `Format-Version: ${ver}`,
      };
    }
  }

  // KiCad 5 sch in new-style wrapper (extremely rare, but guard anyway)
  const schVerMatch = trimmed.match(/^\(kicad_sch\s+\(version\s+(\d+)/);
  if (schVerMatch) {
    const ver = parseInt(schVerMatch[1], 10);
    if (ver < 20210000) {
      return {
        isLegacy: true,
        reason:
          `Diese Schaltplan-Datei verwendet ein sehr altes Format (Version ${ver}).\n` +
          'KiCanvas unterstützt nur KiCad 6+ Format (Version ≥ 20210000).\n\n' +
          `Datei: ${filePath}\n` +
          `Format-Version: ${ver}`,
      };
    }
  }

  return { isLegacy: false, reason: '' };
}

// ── Copyable error box ────────────────────────────────────────────────
function ErrorBox({ title, message }: { title: string; message: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="kc-error-wrapper">
      <div className="kc-error-box">
        <div className="kc-error-header">
          <AlertTriangle size={18} className="kc-error-icon" />
          <span className="kc-error-title">{title}</span>
          <button
            className="kc-error-copy-btn"
            onClick={handleCopy}
            title="Fehlermeldung kopieren"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </div>
        <pre className="kc-error-message">{message}</pre>
        <p className="kc-error-hint">
          Du kannst diese Meldung kopieren und nach einer Lösung suchen.
        </p>
      </div>
    </div>
  );
}

// ── Main KiCanvasViewer component ─────────────────────────────────────
interface KiCanvasViewerProps {
  content: string;
  filePath: string;
  fileType: 'schematic' | 'pcb';
}

type ViewerState = 'loading' | 'ready' | 'error-legacy' | 'error-script' | 'error-render';

export function KiCanvasViewer({ content, filePath, fileType }: KiCanvasViewerProps) {
  const [state, setState] = useState<ViewerState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const embedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // 1. Pre-check for legacy formats
    const fmt = detectFormat(content, filePath);
    if (fmt.isLegacy) {
      setErrorMessage(fmt.reason);
      setState('error-legacy');
      return;
    }

    // 2. Load kicanvas.js if not yet loaded
    loadKiCanvasScript().then(ok => {
      if (!ok) {
        setErrorMessage(
          'kicanvas.js konnte nicht geladen werden.\n\n' +
          'Die lokale Datei public/kicanvas.js fehlt oder ist beschädigt.\n' +
          `Datei: ${filePath}`,
        );
        setState('error-script');
        return;
      }

      // 3. Mount the inline source into the <kicanvas-embed> element
      const embed = embedRef.current;
      if (!embed) { setState('error-render'); return; }

      try {
        // Remove any previous kicanvas-source children
        while (embed.firstChild) embed.removeChild(embed.firstChild);

        // Create <kicanvas-source> with inline KiCad content
        const source = document.createElement('kicanvas-source');
        const mimeType = fileType === 'schematic' ? 'schematic' : 'board';
        source.setAttribute('type', mimeType);
        // Use the last filename component as name so KiCanvas can cross-reference sheets
        const name = filePath.replace(/\\/g, '/').split('/').pop() ?? 'file';
        source.setAttribute('name', name);
        source.textContent = content;
        embed.appendChild(source);

        setState('ready');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(
          `Fehler beim Rendern der Datei:\n${msg}\n\nDatei: ${filePath}`,
        );
        setState('error-render');
      }
    });
  }, [content, filePath, fileType]);

  // ── Render ──────────────────────────────────────────────────────────
  if (state === 'error-legacy') {
    return (
      <ErrorBox
        title="Nicht unterstütztes KiCad-Format (KiCad 5 / Legacy)"
        message={errorMessage}
      />
    );
  }

  if (state === 'error-script') {
    return (
      <ErrorBox
        title="KiCanvas konnte nicht geladen werden"
        message={errorMessage}
      />
    );
  }

  if (state === 'error-render') {
    return (
      <ErrorBox
        title="Fehler beim Rendern"
        message={errorMessage}
      />
    );
  }

  return (
    <div className="kc-viewer-wrapper">
      {state === 'loading' && (
        <div className="kc-loading-overlay">
          <div className="spinner" />
          <span>Lade KiCanvas…</span>
        </div>
      )}
      {/* Use React.createElement to avoid TypeScript JSX issues with custom elements */}
      {React.createElement('kicanvas-embed', {
        ref: embedRef,
        controls: 'full',
        controlslist: 'nodownload',
        style: { width: '100%', height: '100%', display: state === 'ready' ? 'block' : 'none' } as React.CSSProperties,
      })}
    </div>
  );
}
