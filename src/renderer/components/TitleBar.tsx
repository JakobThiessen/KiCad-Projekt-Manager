import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Minus, Square, X, CircuitBoard, Sun, Moon, Settings } from 'lucide-react';
import { useAppStore } from '../store/appStore';

// ── Menu definitions ───────────────────────────────────────────────────
interface MenuItem {
  label: string;
  action?: string;      // action id
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];  // for recent workspaces submenu
}

function buildMenus(recentWorkspaces: string[]): Record<string, MenuItem[]> {
  const recentItems: MenuItem[] = recentWorkspaces.length > 0
    ? [
        ...recentWorkspaces.map(ws => ({
          label: ws.replace(/\\/g, '/').split('/').pop()?.replace('.kicadws', '') ?? ws,
          action: `openRecent:${ws}`,
        })),
        { label: 'separator', separator: true },
        { label: 'Clear Recent', action: 'clearRecent' },
      ]
    : [{ label: '(empty)', disabled: true }];

  return {
    File: [
      { label: 'New Workspace…', action: 'newWorkspace' },
      { label: 'Open Workspace…', action: 'openWorkspace', shortcut: 'Ctrl+O' },
      { label: 'Recent Workspaces', submenu: recentItems },
      { label: 'Close Workspace', action: 'closeWorkspace' },
      { label: 'separator', separator: true },
      { label: 'Add Folder to Workspace…', action: 'addFolder' },
      { label: 'separator', separator: true },
      { label: 'Save', action: 'save', shortcut: 'Ctrl+S' },
      { label: 'Save All', action: 'saveAll', shortcut: 'Ctrl+Shift+S' },
      { label: 'separator', separator: true },
      { label: 'Save Workspace As…', action: 'saveWorkspaceAs' },
      { label: 'separator', separator: true },
      { label: 'Close Tab', action: 'closeTab', shortcut: 'Ctrl+W' },
      { label: 'Close All Tabs', action: 'closeAllTabs' },
      { label: 'separator', separator: true },
      { label: 'Exit', action: 'exit', shortcut: 'Alt+F4' },
    ],
    Edit: [
      { label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z', disabled: true },
      { label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y', disabled: true },
      { label: 'separator', separator: true },
      { label: 'Cut', action: 'cut', shortcut: 'Ctrl+X', disabled: true },
      { label: 'Copy', action: 'copy', shortcut: 'Ctrl+C', disabled: true },
      { label: 'Paste', action: 'paste', shortcut: 'Ctrl+V', disabled: true },
    ],
    View: [
      { label: 'Toggle Sidebar', action: 'toggleSidebar', shortcut: 'Ctrl+B' },
      { label: 'Toggle Bottom Panel', action: 'toggleBottomPanel', shortcut: 'Ctrl+J' },
      { label: 'separator', separator: true },
      { label: 'Toggle Theme', action: 'toggleTheme' },
      { label: 'separator', separator: true },
      { label: 'Zoom In', action: 'zoomIn', shortcut: 'Ctrl+=' },
      { label: 'Zoom Out', action: 'zoomOut', shortcut: 'Ctrl+-' },
      { label: 'Fit View', action: 'fitView', shortcut: 'Ctrl+0' },
    ],
    Tools: [
      { label: 'Open in KiCad', action: 'openInKicad', shortcut: 'F5' },
      { label: 'separator', separator: true },
      { label: 'Check KiCad Versions…', action: 'kicadVersionCheck' },
      { label: 'separator', separator: true },
      { label: 'Refresh Workspace', action: 'refreshWorkspace', shortcut: 'F5' },
      { label: 'separator', separator: true },
      { label: 'Settings…', action: 'settings' },
    ],
    Help: [
      { label: 'About KiCad PM', action: 'about' },
      { label: 'Keyboard Shortcuts', action: 'shortcuts', shortcut: 'Ctrl+/' },
    ],
  };
}

// ── Action handlers ────────────────────────────────────────────────────
async function executeAction(action: string) {
  const store = useAppStore.getState();

  switch (action) {
    // File
    case 'newWorkspace': {
      // Create an untitled workspace immediately — no dialog needed
      const ws = await window.api.createWorkspace();
      store.setWorkspace(ws);
      store.setWorkspaceDirty(true);
      store.setFileTree(null as any);
      break;
    }
    case 'openWorkspace': {
      const result = await window.api.showOpenDialog({
        properties: ['openFile'],
        title: 'Open KiCad Workspace',
        filters: [{ name: 'KiCad Workspace', extensions: ['kicadws'] }],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        store.setGlobalProgress({ message: 'Workspace wird geöffnet…', indeterminate: true });
        try {
          const ws = await window.api.openWorkspaceFile(result.filePaths[0]);
          store.setWorkspace(ws);
          store.setWorkspaceDirty(false);
          const tree = await window.api.getFileTree();
          if (tree) store.setFileTree(tree);
        } finally {
          store.setGlobalProgress(null);
        }
      }
      break;
    }
    case 'closeWorkspace': {
      store.clearWorkspace();
      break;
    }
    case 'addFolder': {
      const result = await window.api.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Add Folder to Workspace',
      });
      if (!result.canceled && result.filePaths.length > 0) {
        store.setGlobalProgress({ message: 'Ordner wird hinzugefügt…', indeterminate: true });
        try {
          const res = await window.api.addFolder(result.filePaths[0]);
          if (res.workspace) {
            store.setWorkspace(res.workspace);
            store.setWorkspaceDirty(true);
          }
          const tree = await window.api.getFileTree();
          if (tree) store.setFileTree(tree);
        } finally {
          store.setGlobalProgress(null);
        }
      }
      break;
    }
    case 'save': {
      // If workspace is dirty, save the workspace first
      if (store.workspaceDirty && store.workspace) {
        const res = await window.api.saveWorkspace();
        if (res.success) {
          store.setWorkspaceDirty(false);
          if (res.workspace) store.setWorkspace(res.workspace);
        }
      }
      // Also save the active tab if dirty
      const tab = store.tabs.find(t => t.id === store.activeTabId);
      if (tab && tab.isDirty && tab.content != null) {
        await window.api.writeFile(tab.filePath, tab.content);
        store.setTabDirty(tab.id, false);
      }
      break;
    }
    case 'saveAll': {
      // Save workspace if dirty
      if (store.workspaceDirty && store.workspace) {
        const res = await window.api.saveWorkspace();
        if (res.success) {
          store.setWorkspaceDirty(false);
          if (res.workspace) store.setWorkspace(res.workspace);
        }
      }
      for (const tab of store.tabs) {
        if (tab.isDirty && tab.content != null) {
          await window.api.writeFile(tab.filePath, tab.content);
          store.setTabDirty(tab.id, false);
        }
      }
      break;
    }
    case 'closeTab': {
      if (store.activeTabId) store.closeTab(store.activeTabId);
      break;
    }
    case 'closeAllTabs': {
      for (const tab of [...store.tabs]) store.closeTab(tab.id);
      break;
    }
    case 'exit':
      window.api.closeWindow();
      break;

    // View
    case 'toggleSidebar':
      store.toggleSidebar();
      break;
    case 'toggleBottomPanel':
      store.toggleBottomPanel();
      break;
    case 'toggleTheme':
      store.toggleTheme();
      break;

    // Tools
    case 'openInKicad': {
      const tab = store.tabs.find(t => t.id === store.activeTabId);
      if (!tab) break;

      // Find the KiCad project associated with this file
      const normTabPath = tab.filePath.replace(/\\/g, '/');
      const project = store.workspace?.projects.find(p =>
        normTabPath.startsWith(p.directory.replace(/\\/g, '/'))
      ) ?? null;

      // Detect available KiCad installations
      const installations = await window.api.detectKicadInstallations();

      if (installations.length === 0) {
        // No installation found – fall back to OS default
        await window.api.launchKicad(tab.filePath);
        break;
      }

      const projectVersion = project?.kicadVersion;

      // Find exact version match, then major-version match
      const exactMatch = projectVersion
        ? installations.find(i => i.version === projectVersion)
        : null;
      const majorMatch = projectVersion && !exactMatch
        ? installations.find(i =>
            i.version.split('.')[0] === projectVersion.split('.')[0]
          )
        : null;
      const bestMatch = exactMatch ?? majorMatch;

      // If there's only one installation and it matches (or project has no version), launch silently
      if (installations.length === 1 && (!projectVersion || bestMatch)) {
        const result = await window.api.launchKicadWithVersion(
          installations[0].executablePath,
          tab.filePath
        );
        if (!result.success) {
          console.error('KiCad launch failed:', result.error);
        }
        break;
      }

      // If there's a perfect match and project has a version, launch directly
      if (exactMatch) {
        const result = await window.api.launchKicadWithVersion(exactMatch.executablePath, tab.filePath);
        if (!result.success) console.error('KiCad launch failed:', result.error);
        break;
      }

      // Otherwise show the "Open with version" dialog
      // We pass the project (or a minimal stand-in) plus all installations
      const projectForDialog = project ?? {
        name: tab.title,
        path: tab.filePath,
        directory: tab.filePath.replace(/[/\\][^/\\]+$/, ''),
        schematicFiles: [],
        pcbFiles: [],
        gerberFiles: [],
        modelFiles: [],
        kicadVersion: projectVersion,
        lastModified: 0,
      };
      store.setKicadOpenWithProject({ project: projectForDialog, installations });
      break;
    }
    case 'kicadVersionCheck': {
      store.setKicadVersionDialogOpen(true);
      break;
    }
    case 'refreshWorkspace': {
      if (store.workspace) {
        store.setGlobalProgress({ message: 'Workspace wird aktualisiert…', indeterminate: true });
        try {
          const ws = await window.api.scanWorkspace();
          if (ws) store.setWorkspace(ws);
          const tree = await window.api.getFileTree();
          if (tree) store.setFileTree(tree);
        } finally {
          store.setGlobalProgress(null);
        }
      }
      break;
    }
    case 'saveWorkspaceAs': {
      const res = await window.api.saveWorkspaceAs();
      if (res.success && res.workspace) {
        store.setWorkspace(res.workspace);
        store.setWorkspaceDirty(false);
        const tree = await window.api.getFileTree();
        if (tree) store.setFileTree(tree);
      } else if (!res.canceled && res.error) {
        console.error('Save Workspace As failed:', res.error);
      }
      break;
    }
    case 'settings': {
      store.setSettingsOpen(true);
      break;
    }
    case 'clearRecent': {
      await window.api.clearRecentWorkspaces();
      break;
    }

    case 'about': {
      store.setAboutOpen(true);
      break;
    }

    case 'shortcuts': {
      store.setShortcutsOpen(true);
      break;
    }

    default: {
      // Handle openRecent:path actions
      if (action.startsWith('openRecent:')) {
        const wsPath = action.slice('openRecent:'.length);
        const ws = await window.api.openWorkspaceFile(wsPath);
        store.setWorkspace(ws);
        store.setWorkspaceDirty(false);
        const tree = await window.api.getFileTree();
        if (tree) store.setFileTree(tree);
      } else {
        console.log('Action not implemented:', action);
      }
    }
  }
}

// ── TitleBar component ─────────────────────────────────────────────────
export function TitleBar() {
  const workspace = useAppStore(s => s.workspace);
  const workspaceDirty = useAppStore(s => s.workspaceDirty);
  const theme = useAppStore(s => s.theme);
  const editorPanelVisible = useAppStore(s => s.editorPanelVisible);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Load recent workspaces when File menu opens
  useEffect(() => {
    if (openMenu === 'File') {
      window.api.getRecentWorkspaces().then(setRecentWorkspaces);
    }
  }, [openMenu]);

  const menus = buildMenus(recentWorkspaces);

  // Close on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  // Close on escape
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openMenu]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'o') { e.preventDefault(); executeAction('openWorkspace'); }
      else if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); executeAction('saveAll'); }
      else if (ctrl && e.key === 's') { e.preventDefault(); executeAction('save'); }
      else if (ctrl && e.key === 'w') { e.preventDefault(); executeAction('closeTab'); }
      else if (ctrl && e.key === 'b') { e.preventDefault(); executeAction('toggleSidebar'); }
      else if (ctrl && e.key === 'j') { e.preventDefault(); executeAction('toggleBottomPanel'); }
      else if (ctrl && e.key === '/') { e.preventDefault(); executeAction('shortcuts'); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleMenuButtonClick = (menuName: string) => {
    setOpenMenu(prev => prev === menuName ? null : menuName);
  };

  const handleMenuButtonEnter = (menuName: string) => {
    if (openMenu) setOpenMenu(menuName);
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.separator || item.disabled || item.submenu) return;
    setOpenMenu(null);
    setHoveredSubmenu(null);
    if (item.action) executeAction(item.action);
  };

  return (
    <div className="titlebar">
      <div className="titlebar-logo">
        <CircuitBoard />
        <span>KiCad PM</span>
      </div>

      <div className="titlebar-menu" ref={menuBarRef}>
        {Object.entries(menus).map(([name, items]) => (
          <div key={name} className="menu-button-wrapper">
            <button
              className={openMenu === name ? 'active' : ''}
              onClick={() => handleMenuButtonClick(name)}
              onMouseEnter={() => handleMenuButtonEnter(name)}
            >
              {name}
            </button>
            {openMenu === name && (
              <div className="menu-dropdown">
                {items.map((item, i) =>
                  item.separator ? (
                    <div key={i} className="menu-separator" />
                  ) : item.submenu ? (
                    <div
                      key={i}
                      className="menu-item has-submenu"
                      onMouseEnter={() => setHoveredSubmenu(item.label)}
                      onMouseLeave={() => setHoveredSubmenu(null)}
                    >
                      <span className="menu-item-label">{item.label}</span>
                      <span className="menu-item-arrow">▸</span>
                      {hoveredSubmenu === item.label && (
                        <div className="menu-dropdown submenu">
                          {item.submenu.map((sub, j) =>
                            sub.separator ? (
                              <div key={j} className="menu-separator" />
                            ) : (
                              <div
                                key={j}
                                className={`menu-item ${sub.disabled ? 'disabled' : ''}`}
                                onClick={() => handleItemClick(sub)}
                                title={sub.action?.startsWith('openRecent:') ? sub.action.slice('openRecent:'.length) : undefined}
                              >
                                <span className="menu-item-label">{sub.label}</span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={`menu-item ${item.disabled ? 'disabled' : ''}`}
                      onClick={() => handleItemClick(item)}
                    >
                      <span className="menu-item-label">{item.label}</span>
                      {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="titlebar-spacer" />

      {editorPanelVisible && (
        <div className="titlebar-title">
          {workspace
            ? (workspace.filePath
                ? workspace.filePath.split(/[/\\]/).pop()?.replace('.kicadws', '')
                : 'Untitled')
              + (workspaceDirty ? ' *' : '')
            : 'KiCad Project Manager'}
        </div>
      )}

      <div className="titlebar-spacer" />

      <div className="titlebar-controls">
        <button onClick={() => useAppStore.getState().toggleTheme()} title="Toggle Theme" style={{ marginRight: '4px' }}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={() => window.api.minimizeWindow()} title="Minimize">
          <Minus size={14} />
        </button>
        <button onClick={() => window.api.maximizeWindow()} title="Maximize">
          <Square size={12} />
        </button>
        <button className="close" onClick={() => window.api.closeWindow()} title="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
