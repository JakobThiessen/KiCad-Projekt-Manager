import React, { useEffect, useCallback } from 'react';
import { X, Keyboard } from 'lucide-react';
import { useAppStore } from '../store/appStore';

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Datei',
    shortcuts: [
      { keys: ['Ctrl', 'O'],         description: 'Workspace öffnen' },
      { keys: ['Ctrl', 'S'],         description: 'Speichern' },
      { keys: ['Ctrl', 'Shift', 'S'], description: 'Alle speichern' },
      { keys: ['Ctrl', 'W'],         description: 'Tab schließen' },
      { keys: ['Alt', 'F4'],         description: 'Anwendung beenden' },
    ],
  },
  {
    title: 'Ansicht',
    shortcuts: [
      { keys: ['Ctrl', 'B'],  description: 'Seitenleiste ein-/ausblenden' },
      { keys: ['Ctrl', 'J'],  description: 'Unteres Panel ein-/ausblenden' },
      { keys: ['Ctrl', '='],  description: 'Hereinzoomen' },
      { keys: ['Ctrl', '-'],  description: 'Herauszoomen' },
      { keys: ['Ctrl', '0'],  description: 'Ansicht einpassen' },
    ],
  },
  {
    title: 'Bearbeiten',
    shortcuts: [
      { keys: ['Ctrl', 'Z'],  description: 'Rückgängig' },
      { keys: ['Ctrl', 'Y'],  description: 'Wiederholen' },
      { keys: ['Ctrl', 'X'],  description: 'Ausschneiden' },
      { keys: ['Ctrl', 'C'],  description: 'Kopieren' },
      { keys: ['Ctrl', 'V'],  description: 'Einfügen' },
    ],
  },
  {
    title: 'Tools',
    shortcuts: [
      { keys: ['F5'],         description: 'In KiCad öffnen / Workspace aktualisieren' },
    ],
  },
  {
    title: 'Allgemein',
    shortcuts: [
      { keys: ['Escape'],     description: 'Dialog schließen / Menü schließen' },
      { keys: ['Ctrl', '/'],  description: 'Tastaturkürzel anzeigen' },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const shortcutsOpen = useAppStore(s => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore(s => s.setShortcutsOpen);

  const handleClose = useCallback(() => setShortcutsOpen(false), [setShortcutsOpen]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcutsOpen, handleClose]);

  if (!shortcutsOpen) return null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="shortcuts-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <div className="shortcuts-header-title">
            <Keyboard size={16} />
            <h2>Tastaturkürzel</h2>
          </div>
          <button className="settings-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map(group => (
            <section key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <div className="shortcuts-list">
                {group.shortcuts.map((entry, i) => (
                  <div key={i} className="shortcuts-row">
                    <span className="shortcuts-description">{entry.description}</span>
                    <span className="shortcuts-keys">
                      {entry.keys.map((key, ki) => (
                        <React.Fragment key={ki}>
                          <kbd className="shortcuts-kbd">{key}</kbd>
                          {ki < entry.keys.length - 1 && (
                            <span className="shortcuts-plus">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="shortcuts-footer">
          <span className="shortcuts-footer-hint">Drücke <kbd className="shortcuts-kbd">Esc</kbd> zum Schließen</span>
        </div>
      </div>
    </div>
  );
}
