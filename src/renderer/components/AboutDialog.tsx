import React, { useEffect, useCallback, useState } from 'react';
import { X, CircuitBoard, ScrollText } from 'lucide-react';
import { useAppStore } from '../store/appStore';

const APP_INFO = {
  name: 'KiCad Project Manager',
  version: '1.0.4',
  description: 'KiCad Project Manager with integrated Schematic/PCB Editor, Gerber Viewer and 3D Viewer',
  author: 'JThiessen',
  license: 'MIT',
  homepage: 'https://github.com/JakobThiessen/KiCad-Projekt-Manager',
  electron: '40.6.0',
};

interface ThirdPartyLicense {
  name: string;
  author: string;
  license: string;
  url: string;
}

const THIRD_PARTY: ThirdPartyLicense[] = [
  // ── Core runtime ────────────────────────────────────────────────────────────
  {
    name: 'Electron',
    author: 'OpenJS Foundation',
    license: 'MIT',
    url: 'https://electronjs.org',
  },
  {
    name: 'React',
    author: 'Meta Platforms, Inc.',
    license: 'MIT',
    url: 'https://react.dev',
  },
  {
    name: 'React DOM',
    author: 'Meta Platforms, Inc.',
    license: 'MIT',
    url: 'https://react.dev',
  },
  {
    name: 'Zustand',
    author: 'Paul Henschel',
    license: 'MIT',
    url: 'https://github.com/pmndrs/zustand',
  },
  {
    name: 'Lucide React',
    author: 'Lucide Contributors',
    license: 'ISC',
    url: 'https://lucide.dev',
  },
  // ── KiCad Schematic / PCB viewer ────────────────────────────────────────────
  {
    name: 'KiCanvas',
    author: 'Alethea Katherine Flowers',
    license: 'MIT',
    url: 'https://github.com/theacodes/kicanvas',
  },
  {
    name: 'Earcut (via KiCanvas)',
    author: 'Mapbox',
    license: 'ISC',
    url: 'https://github.com/mapbox/earcut',
  },
  {
    name: 'Newstroke Font (via KiCanvas)',
    author: 'Vladimir Uryvaev, Lingdong Huang, Adobe, KiCad Contributors',
    license: 'CC0 1.0 / MIT-like / SIL OFL 1.1',
    url: 'https://github.com/theacodes/kicanvas',
  },
  {
    name: 'Material Symbols (via KiCanvas)',
    author: 'Google',
    license: 'Apache 2.0',
    url: 'https://github.com/google/material-design-icons',
  },
  {
    name: 'Nunito Font (via KiCanvas)',
    author: 'Vernon Adams, Manvel Shmavonyan',
    license: 'SIL Open Font License',
    url: 'https://fonts.google.com/specimen/Nunito',
  },
  {
    name: 'Bellota Font (via KiCanvas)',
    author: 'Kemie Guaida',
    license: 'SIL Open Font License',
    url: 'https://fonts.google.com/specimen/Bellota',
  },
  // ── Gerber viewer ───────────────────────────────────────────────────────────
  {
    name: 'Tracespace Core (@tracespace/core)',
    author: 'Mike Cousins',
    license: 'MIT',
    url: 'https://github.com/tracespace/tracespace',
  },
  {
    name: 'Tracespace Parser (@tracespace/parser)',
    author: 'Mike Cousins',
    license: 'MIT',
    url: 'https://github.com/tracespace/tracespace',
  },
  {
    name: 'Tracespace Plotter (@tracespace/plotter)',
    author: 'Mike Cousins',
    license: 'MIT',
    url: 'https://github.com/tracespace/tracespace',
  },
  {
    name: 'Tracespace Renderer (@tracespace/renderer)',
    author: 'Mike Cousins',
    license: 'MIT',
    url: 'https://github.com/tracespace/tracespace',
  },
  {
    name: 'Tracespace Identify Layers (@tracespace/identify-layers)',
    author: 'Mike Cousins',
    license: 'MIT',
    url: 'https://github.com/tracespace/tracespace',
  },
  // ── 3D Model viewer ─────────────────────────────────────────────────────────
  {
    name: 'Three.js',
    author: 'mrdoob and contributors',
    license: 'MIT',
    url: 'https://github.com/mrdoob/three.js',
  },
  {
    name: 'React Three Fiber (@react-three/fiber)',
    author: 'Poimandres (pmndrs)',
    license: 'MIT',
    url: 'https://github.com/pmndrs/react-three-fiber',
  },
  {
    name: 'React Three Drei (@react-three/drei)',
    author: 'Poimandres (pmndrs)',
    license: 'MIT',
    url: 'https://github.com/pmndrs/drei',
  },
  {
    name: 'occt-import-js',
    author: 'Viktor Kovacs',
    license: 'MIT',
    url: 'https://github.com/kovacsv/occt-import-js',
  },
  // ── PDF viewer ──────────────────────────────────────────────────────────────
  {
    name: 'PDF.js (pdfjs-dist)',
    author: 'Mozilla Foundation',
    license: 'Apache 2.0',
    url: 'https://github.com/mozilla/pdf.js',
  },
  // ── Markdown viewer ─────────────────────────────────────────────────────────
  {
    name: 'react-markdown',
    author: 'Titus Wormer and contributors',
    license: 'MIT',
    url: 'https://github.com/remarkjs/react-markdown',
  },
  {
    name: 'remark-gfm',
    author: 'Titus Wormer and contributors',
    license: 'MIT',
    url: 'https://github.com/remarkjs/remark-gfm',
  },
  {
    name: 'Mermaid',
    author: 'Knut Sveidqvist and contributors',
    license: 'MIT',
    url: 'https://github.com/mermaid-js/mermaid',
  },
  // ── Terminal ─────────────────────────────────────────────────────────────────
  {
    name: 'xterm.js (@xterm/xterm)',
    author: 'The xterm.js authors',
    license: 'MIT',
    url: 'https://github.com/xtermjs/xterm.js',
  },
];

export function AboutDialog() {
  const aboutOpen = useAppStore(s => s.aboutOpen);
  const setAboutOpen = useAppStore(s => s.setAboutOpen);
  const [tab, setTab] = useState<'about' | 'licenses'>('about');

  const handleClose = useCallback(() => { setAboutOpen(false); setTab('about'); }, [setAboutOpen]);

  useEffect(() => {
    if (!aboutOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [aboutOpen, handleClose]);

  if (!aboutOpen) return null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="about-dialog" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>About</h2>
          <button className="settings-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="about-tabs">
          <button
            className={`about-tab ${tab === 'about' ? 'active' : ''}`}
            onClick={() => setTab('about')}
          >
            <CircuitBoard size={13} /> App
          </button>
          <button
            className={`about-tab ${tab === 'licenses' ? 'active' : ''}`}
            onClick={() => setTab('licenses')}
          >
            <ScrollText size={13} /> Lizenzen
          </button>
        </div>

        {tab === 'about' && (
          <div className="about-body">
            <div className="about-logo">
              <CircuitBoard size={48} />
            </div>
            <h3 className="about-app-name">{APP_INFO.name}</h3>
            <span className="about-version">v{APP_INFO.version}</span>
            <p className="about-description">{APP_INFO.description}</p>

            <div className="about-details">
              <div className="about-row">
                <span className="about-label">Developer</span>
                <span className="about-value">{APP_INFO.author}</span>
              </div>
              <div className="about-row">
                <span className="about-label">License</span>
                <span className="about-value">{APP_INFO.license}</span>
              </div>
              <div className="about-row">
                <span className="about-label">Electron</span>
                <span className="about-value">{APP_INFO.electron}</span>
              </div>
              <div className="about-row">
                <span className="about-label">GitHub</span>
                <a
                  className="about-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.api.openInDefaultApp(APP_INFO.homepage);
                  }}
                >
                  Repository öffnen
                </a>
              </div>
            </div>
          </div>
        )}

        {tab === 'licenses' && (
          <div className="about-licenses-body">
            <p className="about-licenses-intro">
              Dieses Projekt verwendet folgende Open-Source-Komponenten:
            </p>
            {THIRD_PARTY.map(lib => (
              <div key={lib.name} className="about-license-row">
                <div className="about-license-top">
                  <span className="about-license-name">{lib.name}</span>
                  <span className="about-license-badge">{lib.license}</span>
                </div>
                <div className="about-license-author">{lib.author}</div>
                <a
                  className="about-link about-license-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.api.openInDefaultApp(lib.url);
                  }}
                >
                  {lib.url.replace('https://', '')}
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="settings-footer">
          <button className="settings-btn settings-btn-primary" onClick={handleClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
