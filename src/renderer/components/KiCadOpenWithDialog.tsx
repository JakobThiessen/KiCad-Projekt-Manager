import React, { useCallback, useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { KiCadInstallation } from '../../shared/types';

/**
 * Dialog shown when opening a KiCad project in KiCad.
 * If the project's saved version differs from any installed version,
 * the user can pick which version to use. The latest is pre-selected.
 */
export function KiCadOpenWithDialog() {
  const data = useAppStore(s => s.kicadOpenWithProject);
  const setData = useAppStore(s => s.setKicadOpenWithProject);

  const [selectedExe, setSelectedExe] = useState('');
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  const installations = data?.installations ?? [];
  const project = data?.project ?? null;

  // When dialog opens, pre-select the best matching installation
  useEffect(() => {
    if (!data || installations.length === 0) return;

    const projectVersion = project?.kicadVersion;
    // Try exact match first
    const exact = projectVersion
      ? installations.find(i => i.version === projectVersion || i.version.startsWith(projectVersion.split('.')[0] + '.'))
      : null;
    // Fall back to first (newest)
    setSelectedExe((exact ?? installations[0]).executablePath);
    setError('');
  }, [data]);

  const handleClose = useCallback(() => {
    setData(null);
    setError('');
  }, [setData]);

  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [data, handleClose]);

  const handleOpen = async () => {
    if (!project || !selectedExe) return;
    setLaunching(true);
    setError('');
    try {
      const result = await window.api.launchKicadWithVersion(selectedExe, project.path);
      if (result.success) {
        handleClose();
      } else {
        setError(`Failed to launch: ${result.error ?? 'Unknown error'}`);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLaunching(false);
    }
  };

  if (!data) return null;

  const projectVersion = project?.kicadVersion;
  const selectedInst = installations.find(i => i.executablePath === selectedExe);
  const exactMatchAvailable = projectVersion
    ? installations.some(i => i.version === projectVersion || i.version.startsWith(projectVersion.split('.')[0] + '.'))
    : true;
  const versionMismatch = projectVersion && selectedInst && selectedInst.version !== projectVersion
    && !selectedInst.version.startsWith(projectVersion.split('.')[0] + '.');

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-dialog" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Open in KiCad</h2>
          <button className="settings-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-body" style={{ padding: '16px 20px' }}>
          {/* Project info */}
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--bg-overlay)',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
              {project?.name ?? '—'}
            </div>
            {projectVersion ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Saved with KiCad {projectVersion}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                KiCad version unknown
              </div>
            )}
          </div>

          {/* Version mismatch warning */}
          {projectVersion && !exactMatchAvailable && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                background: 'rgba(229,160,0,0.1)',
                borderRadius: 6,
                border: '1px solid rgba(229,160,0,0.4)',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1, color: '#e5a000' }} />
              <span>
                KiCad {projectVersion} is not installed. The project can be opened with a different
                version — compatibility is not guaranteed.
              </span>
            </div>
          )}

          {versionMismatch && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                background: 'rgba(229,160,0,0.08)',
                borderRadius: 6,
                border: '1px solid rgba(229,160,0,0.3)',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: '#e5a000' }} />
              <span>
                The selected version ({selectedInst?.version}) does not match the project version ({projectVersion}).
              </span>
            </div>
          )}

          {/* Version selection */}
          {installations.length > 0 ? (
            <div>
              <label
                style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text-primary)' }}
              >
                Select KiCad version:
              </label>
              <select
                value={selectedExe}
                onChange={e => setSelectedExe(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'var(--bg-input, var(--bg-overlay))',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {installations.map(inst => (
                  <option key={inst.executablePath} value={inst.executablePath}>
                    KiCad {inst.version}
                    {projectVersion && inst.version === projectVersion ? ' ✓ (project version)' :
                     projectVersion && inst.version.startsWith(projectVersion.split('.')[0] + '.') ? ' (compatible)' : ''}
                  </option>
                ))}
              </select>
              {selectedInst && (
                <div
                  style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, wordBreak: 'break-all' }}
                >
                  {selectedInst.executablePath}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No KiCad installations found.
              Run <strong>Tools › Check KiCad Versions…</strong> first.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, color: 'var(--color-error, #f44336)', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="settings-btn" onClick={handleClose}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button
            className="settings-btn settings-btn-primary"
            onClick={handleOpen}
            disabled={!selectedExe || launching || installations.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <ExternalLink size={17} />
            {launching ? 'Opening…' : 'Open in KiCad'}
          </button>
        </div>
      </div>
    </div>
  );
}
