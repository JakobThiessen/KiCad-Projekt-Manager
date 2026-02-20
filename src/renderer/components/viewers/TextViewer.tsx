import React from 'react';
import { ExternalLink } from 'lucide-react';

interface TextViewerProps {
  content: string;
  filePath: string;
}

export function TextViewer({ content, filePath }: TextViewerProps) {
  return (
    <div className="viewer-container">
      <div className="toolbar">
        <button
          className="toolbar-btn"
          onClick={() => window.api.launchKicad(filePath)}
          title="Open Externally"
        >
          <ExternalLink size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
          {filePath.split(/[/\\]/).pop()} — {content.length} chars
        </span>
      </div>
      <pre style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
        margin: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
        background: 'var(--bg-base)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        userSelect: 'text',
      }}>
        {content}
      </pre>
    </div>
  );
}
