import React from 'react';
import { useAppStore } from '../store/appStore';

export function StatusBar() {
  const workspace = useAppStore(s => s.workspace);
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="statusbar">
      <div className="statusbar-item">
        {workspace ? (
          <span>{workspace.projects.length} project(s)</span>
        ) : (
          <span>No workspace</span>
        )}
      </div>

      <div className="statusbar-spacer" />

      {activeTab && (
        <>
          <div className="statusbar-item">
            <span>{activeTab.fileType.toUpperCase()}</span>
          </div>
          <div className="statusbar-item">
            <span>{activeTab.isDirty ? 'Modified' : 'Saved'}</span>
          </div>
        </>
      )}

      <div className="statusbar-item">
        <span>v0.1.0</span>
      </div>
    </div>
  );
}
