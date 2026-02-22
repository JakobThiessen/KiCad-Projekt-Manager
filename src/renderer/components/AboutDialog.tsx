import React, { useEffect, useCallback, useState } from 'react';
import { X, CircuitBoard, ScrollText } from 'lucide-react';
import { useAppStore } from '../store/appStore';

const APP_INFO = {
  name: 'KiCad Project Manager',
  version: '1.0.3',
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
  {
    name: 'KiCanvas',
    author: 'Alethea Katherine Flowers',
    license: 'MIT',
    url: 'https://github.com/theacodes/kicanvas',
  },
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
