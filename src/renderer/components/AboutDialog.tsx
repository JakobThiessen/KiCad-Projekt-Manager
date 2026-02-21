import React, { useEffect, useCallback } from 'react';
import { X, CircuitBoard } from 'lucide-react';
import { useAppStore } from '../store/appStore';

// These values are inlined from package.json at build time via define/replace,
// but for simplicity we hardcode them here matching package.json.
const APP_INFO = {
  name: 'KiCad Project Manager',
  version: '1.0.2',
  description: 'KiCad Project Manager with integrated Schematic/PCB Editor, Gerber Viewer and 3D Viewer',
  author: 'JThiessen',
  license: 'MIT',
  homepage: 'https://github.com/JakobThiessen/KiCad-Projekt-Manager',
  electron: '40.6.0',
};

export function AboutDialog() {
  const aboutOpen = useAppStore(s => s.aboutOpen);
  const setAboutOpen = useAppStore(s => s.setAboutOpen);

  const handleClose = useCallback(() => setAboutOpen(false), [setAboutOpen]);

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

        <div className="settings-footer">
          <button className="settings-btn settings-btn-primary" onClick={handleClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
