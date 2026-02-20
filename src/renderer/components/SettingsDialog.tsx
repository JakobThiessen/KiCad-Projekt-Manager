import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export function SettingsDialog() {
  const settingsOpen = useAppStore(s => s.settingsOpen);
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen);
  const theme = useAppStore(s => s.theme);
  const toggleTheme = useAppStore(s => s.toggleTheme);

  const [recentMaxCount, setRecentMaxCount] = useState(10);
  const [loading, setLoading] = useState(true);

  // Load app settings on open
  useEffect(() => {
    if (!settingsOpen) return;
    setLoading(true);
    window.api.getAppSettings().then(s => {
      setRecentMaxCount(s.recentMaxCount ?? 10);
      setLoading(false);
    });
  }, [settingsOpen]);

  const handleSave = useCallback(async () => {
    await window.api.setAppSettings({
      theme,
      recentMaxCount,
    });
    setSettingsOpen(false);
  }, [theme, recentMaxCount, setSettingsOpen]);

  const handleClose = useCallback(() => {
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [settingsOpen, handleClose]);

  if (!settingsOpen) return null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="settings-body" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        ) : (
          <div className="settings-body">
            {/* Theme */}
            <div className="settings-row">
              <label className="settings-label">Color Scheme</label>
              <div className="settings-control">
                <select
                  value={theme}
                  onChange={e => {
                    if (e.target.value !== theme) toggleTheme();
                  }}
                  className="settings-select"
                >
                  <option value="dark">Dark (Catppuccin Mocha)</option>
                  <option value="light">Light (Catppuccin Latte)</option>
                </select>
              </div>
            </div>

            {/* Recent max count */}
            <div className="settings-row">
              <label className="settings-label">Recent Workspaces (max entries)</label>
              <div className="settings-control">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={recentMaxCount}
                  onChange={e => setRecentMaxCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                  className="settings-input"
                />
              </div>
            </div>
          </div>
        )}

        <div className="settings-footer">
          <button className="settings-btn settings-btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button className="settings-btn settings-btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
