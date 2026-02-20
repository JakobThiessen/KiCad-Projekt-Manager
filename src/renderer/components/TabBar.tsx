import React from 'react';
import { X, Cpu, CircuitBoard, Layers, Box, FileText } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { EditorTab, KicadFileType } from '../../shared/types';

export function TabBar() {
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const closeTab = useAppStore(s => s.closeTab);

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onMouseDown={(e) => {
            // Middle click to close
            if (e.button === 1) {
              e.preventDefault();
              closeTab(tab.id);
            }
          }}
        >
          <TabIcon fileType={tab.fileType} />
          <span className="tab-title">{tab.title}</span>
          {tab.isDirty && <span className="tab-dirty" />}
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function TabIcon({ fileType }: { fileType: KicadFileType }) {
  const size = 14;
  const style = { color: getFileTypeColor(fileType) };

  switch (fileType) {
    case 'schematic': return <Cpu size={size} style={style} />;
    case 'pcb': return <CircuitBoard size={size} style={style} />;
    case 'gerber': return <Layers size={size} style={style} />;
    case '3d-model': return <Box size={size} style={style} />;
    default: return <FileText size={size} style={style} />;
  }
}

function getFileTypeColor(fileType: KicadFileType): string {
  switch (fileType) {
    case 'schematic': return 'var(--accent-green)';
    case 'pcb': return 'var(--accent-blue)';
    case 'gerber': return 'var(--accent-yellow)';
    case '3d-model': return 'var(--accent-purple)';
    default: return 'var(--text-muted)';
  }
}
