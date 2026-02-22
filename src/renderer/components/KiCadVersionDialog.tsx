import React, { useCallback, useEffect, useState } from 'react';
import { X, Search, CheckCircle, AlertCircle, Save, FolderOpen } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { KiCadInstallation } from '../../shared/types';

export function KiCadVersionDialog() {
  const open = useAppStore(s => s.kicadVersionDialogOpen);
  const setOpen = useAppStore(s => s.setKicadVersionDialogOpen);
  const workspace = useAppStore(s => s.workspace);

  const [installations, setInstallations] = useState<KiCadInstallation[]>([]);
  const [savedPaths, setSavedPaths] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleClose = useCallback(() => {
    setOpen(false);
    setSavedMsg('');
  }, [setOpen]);

  // Scan on open
  useEffect(() => {
    if (!open) return;
    setScanning(true);
    setSavedMsg('');
    Promise.all([
      window.api.detectKicadInstallations(),
      window.api.getKicadInstallPaths(),
    ]).then(([found, paths]) => {
      setInstallations(found);
      setSavedPaths(paths);
      setScanning(false);
    }).catch(() => setScanning(false));
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  const handleSaveAll = async () => {
    const paths: Record<string, string> = {};
    for (const inst of installations) {
      paths[inst.version] = inst.executablePath;
    }
    await window.api.saveKicadInstallPaths(paths);
    setSavedPaths(paths);
    setSavedMsg('All paths saved to workspace.');
  };

  const handleManualAdd = async () => {
    const result = await window.api.showOpenDialog({
      title: 'Select KiCad Executable',
      properties: ['openFile'],
      filters: [
        { name: 'KiCad Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return;

    const exePath = result.filePaths[0];
    // Attempt to derive version from path, e.g. …\KiCad\9.0\bin\kicad.exe
    const versionMatch = exePath.replace(/\\/g, '/').match(/KiCad\/([^/]+)\//i);
    const version = versionMatch ? versionMatch[1] : 'custom';
    const installDir = exePath.replace(/[/\\][^/\\]+$/, '').replace(/[/\\]bin$/, '');

    const newInst: KiCadInstallation = { version, executablePath: exePath, installDir };
    setInstallations(prev => {
      const filtered = prev.filter(i => i.version !== version);
      return [newInst, ...filtered];
    });
  };

  const handleSaveOne = async (inst: KiCadInstallation) => {
    const paths = { [inst.version]: inst.executablePath };
    await window.api.saveKicadInstallPaths(paths);
    setSavedPaths(prev => ({ ...prev, ...paths }));
    setSavedMsg(`Version ${inst.version} saved.`);
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-dialog" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Check KiCad Versions</h2>
          <button className="settings-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-body" style={{ padding: '16px 20px', minHeight: 220 }}>
          {scanning ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
              <Search size={18} className="spinner" />
              <span>Scanning for KiCad installations…</span>
            </div>
          ) : installations.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} color="var(--color-warning, #e5a000)" />
                <span>No KiCad installation found.</span>
              </div>
              <p style={{ fontSize: 13, margin: 0 }}>
                KiCad is typically installed at <code>C:\Program Files\KiCad\&lt;Version&gt;\bin\kicad.exe</code>.
                Use &ldquo;Add Manually&rdquo; to specify the path yourself.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--text-muted)' }}>
                Found installations ({installations.length}):
              </p>
              {installations.map(inst => {
                const isSaved = savedPaths[inst.version] === inst.executablePath;
                return (
                  <div
                    key={inst.version}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      background: 'var(--bg-overlay)',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                        KiCad {inst.version}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={inst.executablePath}
                      >
                        {inst.executablePath}
                      </div>
                    </div>
                    {isSaved ? (
                      <span title="Saved to workspace">
                        <CheckCircle size={18} color="var(--color-success, #4caf50)" />
                      </span>
                    ) : (
                      <button
                        className="settings-btn"
                        style={{ padding: '4px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => handleSaveOne(inst)}
                        title="Save this path to workspace"
                      >
                        <Save size={15} />
                        Save
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {savedMsg && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-success, #4caf50)', fontSize: 13 }}>
              <CheckCircle size={14} />
              {savedMsg}
            </div>
          )}

          {!workspace?.filePath && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              No workspace open — paths can only be saved persistently after saving the workspace.
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button
            className="settings-btn"
            onClick={handleManualAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <FolderOpen size={17} />
            Add Manually…
          </button>
          <div style={{ flex: 1 }} />
          {installations.length > 0 && (
            <button
              className="settings-btn settings-btn-primary"
              onClick={handleSaveAll}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <Save size={17} />
              Save All to Workspace
            </button>
          )}
          <button className="settings-btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
