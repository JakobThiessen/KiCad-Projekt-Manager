import React from 'react';
import { FolderOpen, FolderPlus, CircuitBoard } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export function WelcomeScreen() {
  const setWorkspace = useAppStore(s => s.setWorkspace);
  const setFileTree = useAppStore(s => s.setFileTree);
  const setWorkspaceDirty = useAppStore(s => s.setWorkspaceDirty);
  const workspace = useAppStore(s => s.workspace);

  const handleOpenWorkspace = async () => {
    const result = await window.api.showOpenDialog({
      properties: ['openFile'],
      title: 'Open KiCad Workspace',
      filters: [{ name: 'KiCad Workspace', extensions: ['kicadws'] }],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const ws = await window.api.openWorkspaceFile(result.filePaths[0]);
      setWorkspace(ws);
      setWorkspaceDirty(false);
      const tree = await window.api.getFileTree();
      if (tree) setFileTree(tree);
    }
  };

  const handleNewWorkspace = async () => {
    const ws = await window.api.createWorkspace();
    setWorkspace(ws);
    setWorkspaceDirty(true);
  };

  return (
    <div className="welcome-screen">
      <CircuitBoard className="welcome-logo" strokeWidth={1} />
      <h1 className="welcome-title">KiCad Project Manager</h1>
      <p className="welcome-subtitle">
        {workspace
          ? 'Select a project from the sidebar or open a file to get started.'
          : 'Open a .kicadws workspace file or create a new one to manage your KiCad projects.'}
      </p>
      <div className="welcome-actions">
        {!workspace && (
          <>
            <button className="btn btn-primary" onClick={handleOpenWorkspace}>
              <FolderOpen size={16} />
              Open Workspace
            </button>
            <button className="btn btn-secondary" onClick={handleNewWorkspace}>
              <FolderPlus size={16} />
              New Workspace
            </button>
          </>
        )}
        {workspace && (
          <>
            <button className="btn btn-secondary" onClick={handleOpenWorkspace}>
              <FolderOpen size={16} />
              Open Different Workspace
            </button>
            <button className="btn btn-secondary" onClick={handleNewWorkspace}>
              <FolderPlus size={16} />
              New Workspace
            </button>
          </>
        )}
      </div>
      <div style={{ marginTop: '24px', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
        <div>Keyboard Shortcuts:</div>
        <div style={{ marginTop: '4px' }}>Ctrl+O — Open Workspace</div>
        <div>Ctrl+S — Save Current File</div>
        <div>Ctrl+W — Close Tab</div>
      </div>
    </div>
  );
}
