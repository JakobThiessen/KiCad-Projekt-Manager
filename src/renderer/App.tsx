import React, { useCallback, useRef, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { EditorArea } from './components/EditorArea';
import { StatusBar } from './components/StatusBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { SettingsDialog } from './components/SettingsDialog';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useAppStore } from './store/appStore';
import './styles/app.css';

export function App() {
  const workspace = useAppStore(s => s.workspace);
  const sidebarVisible = useAppStore(s => s.sidebarVisible);
  const sidebarWidth = useAppStore(s => s.sidebarWidth);
  const setSidebarWidth = useAppStore(s => s.setSidebarWidth);
  const tabs = useAppStore(s => s.tabs);
  const theme = useAppStore(s => s.theme);
  const editorPanelVisible = useAppStore(s => s.editorPanelVisible);
  const toggleEditorPanel = useAppStore(s => s.toggleEditorPanel);
  const isDragging = useRef(false);

  const setWorkspace = useAppStore(s => s.setWorkspace);
  const setFileTree = useAppStore(s => s.setFileTree);
  const setWorkspaceDirty = useAppStore(s => s.setWorkspaceDirty);

  // Restore last workspace state on mount
  useEffect(() => {
    (async () => {
      try {
        const ws = await window.api.getWorkspace();
        if (ws) {
          setWorkspace(ws);
          const tree = await window.api.getFileTree();
          if (tree) setFileTree(tree);
        }
      } catch { /* no workspace to restore */ }
    })();
  }, []);

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // App-level drag & drop: allow dropping folders anywhere in the window
  const handleAppDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    console.log('[D&D App] dragOver — types:', Array.from(e.dataTransfer.types), 'items:', e.dataTransfer.items.length);
  }, []);

  const handleAppDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    console.log('[D&D App] DROP — files count:', files.length);
    let added = false;
    for (let i = 0; i < files.length; i++) {
      const filePath = window.api.getPathForFile(files[i]);
      console.log('[D&D App] file[' + i + ']:', filePath, 'name:', files[i].name);
      if (filePath) {
        const res = await window.api.addFolder(filePath);
        console.log('[D&D App] addFolder result:', JSON.stringify({ added: res.added, hasWorkspace: !!res.workspace, folders: res.workspace?.folders }));
        if (res.workspace) {
          setWorkspace(res.workspace);
          added = true;
        }
      }
    }
    if (added) {
      setWorkspaceDirty(true);
      const tree = await window.api.getFileTree();
      if (tree) setFileTree(tree);
    }
  }, [setWorkspace, setFileTree, setWorkspaceDirty]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(Math.max(e.clientX, 180), 600);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setSidebarWidth]);

  return (
    <div
      className="app-container"
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
    >
      <TitleBar />
      <div className="app-body">
        {sidebarVisible && (
          <>
            <div className="sidebar-wrapper" style={{ width: sidebarWidth }}>
              <Sidebar />
            </div>
            <div
              className="sidebar-resize-handle"
              onMouseDown={handleMouseDown}
            />
          </>
        )}
        <div className="main-area">
          {editorPanelVisible ? (
            <>
              {tabs.length > 0 && <TabBar />}
              <div className="editor-container">
                {!workspace ? (
                  <WelcomeScreen />
                ) : tabs.length === 0 ? (
                  <WelcomeScreen />
                ) : (
                  <EditorArea />
                )}
              </div>
            </>
          ) : (
            <div className="editor-panel-collapsed">
              <button
                className="editor-panel-toggle-btn"
                onClick={toggleEditorPanel}
                title="Vorschau einblenden"
              >
                <PanelRightOpen size={18} />
                <span>Vorschau</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <StatusBar />
      <SettingsDialog />
    </div>
  );
}
