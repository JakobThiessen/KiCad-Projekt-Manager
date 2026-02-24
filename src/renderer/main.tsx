import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import { browserApi } from './api/browserApi';

// In Electron the contextBridge preload injects window.api.
// In a plain browser session (browser mode) that preload never runs,
// so we polyfill window.api synchronously before React mounts.
// We also check for onFileChanged specifically, so a partial/stale
// Electron API object doesn't slip through undetected.
(function ensureApi() {
  const w = window as Window & { api?: unknown };
  const api = w.api as Record<string, unknown> | undefined;
  if (!api || typeof api['onFileChanged'] !== 'function') {
    (window as Window & { api: unknown }).api = browserApi;
  }
})();

// ── Top-level Error Boundary ──────────────────────────────────────────────
interface EBState { error: Error | null }
class ErrorBoundary extends React.Component<React.PropsWithChildren, EBState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh',
          background: 'var(--bg-base, #1e1e2e)', color: 'var(--text-primary, #cdd6f4)',
          fontFamily: '"Segoe UI", sans-serif', gap: '12px', padding: '32px',
        }}>
          <div style={{ fontSize: '18px', color: '#f38ba8' }}>An error occurred</div>
          <pre style={{
            fontSize: '12px', color: '#f5c2e7', maxWidth: '800px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', textAlign: 'left',
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px', padding: '8px 20px', background: '#89b4fa',
              color: '#1e1e2e', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
