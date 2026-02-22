/**
 * KiCanvasViewer — wraps the KiCanvas web-component (<kicanvas-embed>)
 * for fully offline use. kicanvas.js lives in /public/kicanvas.js (local).
 *
 * Supports KiCad 6, 7, 8, 9 (.kicad_sch / .kicad_pcb).
 * For schematics, ALL sub-sheets are resolved recursively from disk so
 * KiCanvas receives a complete virtual filesystem.
 *
 * KiCad 5 / legacy formats are detected early and shown as a copyable error.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, CheckCheck } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

// Script loader singleton
let scriptState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
const scriptCallbacks: Array<(ok: boolean) => void> = [];

function loadKiCanvasScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (scriptState === 'ready') { resolve(true); return; }
    if (scriptState === 'error') { resolve(false); return; }
    scriptCallbacks.push(resolve);
    if (scriptState === 'loading') return;
    scriptState = 'loading';
    const s = document.createElement('script');
    s.type = 'module';
    s.src = './kicanvas.js';
    s.onload = () => { scriptState = 'ready'; scriptCallbacks.splice(0).forEach(cb => cb(true)); };
    s.onerror = () => { scriptState = 'error'; scriptCallbacks.splice(0).forEach(cb => cb(false)); };
    document.head.appendChild(s);
  });
}

// KiCad 5 / legacy format detection
interface FormatCheck { isLegacy: boolean; reason: string; }

function detectLegacyFormat(content: string, filePath: string): FormatCheck {
  const t = content.trimStart();
  if (t.startsWith('EESchema')) {
    return {
      isLegacy: true,
      reason:
        'Diese Datei ist ein KiCad 5 Schaltplan (EESchema-Format).\n' +
        'KiCanvas unterstuetzt nur KiCad 6 und neuer.\n\n' +
        `Datei: ${filePath}\n` +
        'Formatkennung: EESchema (Legacy .sch)',
    };
  }
  const pcbV = t.match(/^\(kicad_pcb\s+\(version\s+(\d+)/);
  if (pcbV && parseInt(pcbV[1], 10) < 20210000) {
    return {
      isLegacy: true,
      reason:
        `PCB-Datei im Legacy-Format (Version ${pcbV[1]}).\n` +
        'KiCanvas unterstuetzt nur KiCad 6+ (Version >=20210000).\n\n' +
        `Datei: ${filePath}`,
    };
  }
  const schV = t.match(/^\(kicad_sch\s+\(version\s+(\d+)/);
  if (schV && parseInt(schV[1], 10) < 20210000) {
    return {
      isLegacy: true,
      reason:
        `Schaltplan im alten Format (Version ${schV[1]}).\n` +
        'KiCanvas unterstuetzt nur KiCad 6+ (Version >=20210000).\n\n' +
        `Datei: ${filePath}`,
    };
  }
  return { isLegacy: false, reason: '' };
}

// Sub-sheet resolver
function extractSubSheetNames(content: string): string[] {
  const names: string[] = [];
  const re = /\(property\s+"?Sheetfile"?\s+"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}

async function loadSchematicTree(
  rootContent: string,
  rootName: string,
  dirPath: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  files.set(rootName, rootContent);
  const seen = new Set<string>([rootName]);
  const queue = extractSubSheetNames(rootContent);
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const sep = dirPath.includes('\\') ? '\\' : '/';
    const absPath = dirPath + sep + name;
    try {
      const sub: string = await window.api.readFile(absPath);
      files.set(name, sub);
      extractSubSheetNames(sub).forEach(n => { if (!seen.has(n)) queue.push(n); });
    } catch {
      files.set(name, `; Sub-sheet not found: ${absPath}\n`);
    }
  }
  return files;
}

// Copyable error box
function ErrorBox({ title, message }: { title: string; message: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  return (
    <div className="kc-error-wrapper">
      <div className="kc-error-box">
        <div className="kc-error-header">
          <AlertTriangle size={18} className="kc-error-icon" />
          <span className="kc-error-title">{title}</span>
          <button className="kc-error-copy-btn" onClick={copy} title="Fehlermeldung kopieren">
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </div>
        <pre className="kc-error-message">{message}</pre>
        <p className="kc-error-hint">
          Diese Meldung kopieren und im Browser / Issue-Tracker suchen.
        </p>
      </div>
    </div>
  );
}

// Main component
interface KiCanvasViewerProps {
  content: string;
  filePath: string;
  fileType: 'schematic' | 'pcb';
}

type ViewerState = 'loading' | 'ready' | 'error-legacy' | 'error-script' | 'error-render';

/** Map app theme → KiCanvas theme attribute value */
function kcTheme(appTheme: 'dark' | 'light'): string {
  return appTheme === 'dark' ? 'witchhazel' : 'kicad';
}

export function KiCanvasViewer({ content, filePath, fileType }: KiCanvasViewerProps) {
  const [state, setState] = useState<ViewerState>('loading');
  const [loadingStatus, setLoadingStatus] = useState('Datei wird geöffnet…');
  const [errorMessage, setErrorMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<HTMLElement | null>(null);
  const appTheme = useAppStore(s => s.theme);

  // Sync theme changes to already-mounted embed
  useEffect(() => {
    if (embedRef.current) {
      embedRef.current.setAttribute('theme', kcTheme(appTheme));
    }
  }, [appTheme]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      setState('loading');
      setLoadingStatus('Datei wird geöffnet…');

      // 1. Legacy check
      const fmt = detectLegacyFormat(content, filePath);
      if (fmt.isLegacy) {
        if (!cancelled) { setErrorMessage(fmt.reason); setState('error-legacy'); }
        return;
      }

      // 2. Load kicanvas.js
      const ok = await loadKiCanvasScript();
      if (cancelled) return;
      if (!ok) {
        setErrorMessage(
          'kicanvas.js konnte nicht geladen werden.\n\n' +
          'Die lokale Datei public/kicanvas.js fehlt oder ist beschaedigt.\n' +
          `Datei: ${filePath}`,
        );
        setState('error-script');
        return;
      }

      // 3. Determine directory and root filename
      const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      const dirPath = filePath.slice(0, lastSlash);
      const normPath = filePath.replace(/\\/g, '/');
      const rootName = normPath.split('/').pop() ?? 'file';

      // 4. Load all needed files
      let fileMap: Map<string, string>;
      if (fileType === 'schematic') {
        try {
          setLoadingStatus('Sub-Sheets werden aufgelöst…');
          fileMap = await loadSchematicTree(content, rootName, dirPath);
          if (!cancelled) {
            const count = fileMap.size;
            setLoadingStatus(`${count} Datei${count !== 1 ? 'en' : ''} geladen – Ansicht wird aufgebaut…`);
          }
        } catch (err: unknown) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(`Fehler beim Laden der Sub-Sheets:\n${msg}\n\nDatei: ${filePath}`);
          setState('error-render');
          return;
        }
      } else {
        fileMap = new Map([[rootName, content]]);
      }

      if (cancelled) return;

      // 5. Build kicanvas-embed imperatively with all sources already attached,
      //    BEFORE inserting into the real DOM.
      try {
        const embed = document.createElement('kicanvas-embed') as HTMLElement;
        embed.setAttribute('controls', 'full');
        embed.setAttribute('controlslist', 'nodownload');
        embed.setAttribute('theme', kcTheme(useAppStore.getState().theme));
        embed.style.cssText = 'width:100%;height:100%;display:block;';

        // Root file first, then sub-sheets
        const ordered = [rootName, ...[...fileMap.keys()].filter(k => k !== rootName)];
        for (const name of ordered) {
          const src = document.createElement('kicanvas-source') as HTMLElement;
          src.setAttribute('name', name);
          src.textContent = fileMap.get(name) ?? '';
          embed.appendChild(src);
        }

        const container = containerRef.current;
        if (!container || cancelled) return;
        container.innerHTML = '';
        container.appendChild(embed);
        embedRef.current = embed;

        // 6. Wait for KiCanvas to finish rendering before revealing the viewer.
        //    Use the kicanvas:load event, with a 6 s timeout as fallback.
        if (!cancelled) setLoadingStatus('Schaltplan wird gerendert…');
        await new Promise<void>(resolve => {
          if (cancelled) { resolve(); return; }
          const timeout = setTimeout(resolve, 6000);
          embed.addEventListener('kicanvas:load', () => { clearTimeout(timeout); resolve(); }, { once: true });
          // Also listen for error event as fallback
          embed.addEventListener('kicanvas:error', () => { clearTimeout(timeout); resolve(); }, { once: true });
        });

        if (!cancelled) setState('ready');
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Fehler beim Rendern:\n${msg}\n\nDatei: ${filePath}`);
        setState('error-render');
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (embedRef.current) {
        embedRef.current.remove();
        embedRef.current = null;
      }
    };
  }, [content, filePath, fileType]);

  if (state === 'error-legacy') {
    return <ErrorBox title="Nicht unterstuetztes KiCad-Format (KiCad 5 / Legacy)" message={errorMessage} />;
  }
  if (state === 'error-script') {
    return <ErrorBox title="KiCanvas konnte nicht geladen werden" message={errorMessage} />;
  }
  if (state === 'error-render') {
    return <ErrorBox title="Fehler beim Rendern" message={errorMessage} />;
  }

  return (
    <div className="kc-viewer-wrapper">
      {/* Loading overlay — covers everything until KiCanvas fires kicanvas:load */}
      {state === 'loading' && (
        <div className="kc-loading-overlay">
          <div className="spinner" />
          <span className="kc-loading-label">{loadingStatus}</span>
        </div>
      )}
      {/* Container is in DOM during loading so ref is valid, but invisible */}
      <div
        ref={containerRef}
        className="kc-embed-container"
        style={{ width: '100%', height: '100%', visibility: state === 'ready' ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
