import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import mermaid from 'mermaid';
import { useAppStore } from '../../store/appStore';
import { getKicadFileType } from '../../../shared/fileTypes';

// Initialize mermaid once
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'var(--font-mono)',
});

let mermaidIdCounter = 0;

/** Renders a mermaid code block as an SVG diagram */
function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const id = `mermaid-${++mermaidIdCounter}`;
    containerRef.current.innerHTML = '';

    mermaid.render(id, code).then(({ svg }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
      }
    }).catch((err) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<pre style="color:var(--accent-red);font-size:12px;">Mermaid error: ${err.message ?? err}</pre>`;
      }
    });
  }, [code]);

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '16px 0',
        overflow: 'auto',
      }}
    />
  );
}

/** Resolve a relative path against the directory of the current file */
function resolveRelativePath(basePath: string, href: string): string {
  const baseDir = basePath.replace(/[/\\][^/\\]*$/, '');
  // Normalize to forward slashes
  const parts = (baseDir + '/' + href).replace(/\\/g, '/').split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

interface MarkdownViewerProps {
  content: string;
  filePath: string;
}

export function MarkdownViewer({ content, filePath }: MarkdownViewerProps) {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const openTab = useAppStore(s => s.openTab);

  const components = useMemo(() => createMdComponents(filePath, openTab), [filePath, openTab]);

  return (
    <div className="viewer-container">
      <div className="toolbar">
        <button
          className="toolbar-btn"
          onClick={() => window.api.openInDefaultApp(filePath)}
          title="Open in default editor"
        >
          <ExternalLink size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
          {fileName}
        </span>
      </div>
      <div className="markdown-body" style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/**
 * Inline markdown renderer for embedding in other viewers (e.g. ProjectInfoViewer).
 * No toolbar, just rendered content.
 */
export function MarkdownContent({ content, basePath }: { content: string; basePath?: string }) {
  const openTab = useAppStore(s => s.openTab);
  const components = useMemo(
    () => createMdComponents(basePath ?? '', openTab),
    [basePath, openTab]
  );

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Create custom components for ReactMarkdown (mermaid + link handling) */
function createMdComponents(
  filePath: string,
  openTab: (filePath: string, title: string, fileType?: any) => void,
) {
  return {
    // Render mermaid code blocks as diagrams
    code({ className, children, ...props }: any) {
      const match = /language-mermaid/.exec(className || '');
      if (match) {
        const code = String(children).replace(/\n$/, '');
        return <MermaidBlock code={code} />;
      }
      return <code className={className} {...props}>{children}</code>;
    },

    // Handle relative .md links by opening them in a new tab
    a({ href, children, ...props }: any) {
      const handleClick = (e: React.MouseEvent) => {
        if (!href) return;

        // External links — open in default browser
        if (/^https?:\/\//.test(href)) {
          e.preventDefault();
          window.api.openInDefaultApp(href);
          return;
        }

        // Relative .md/.markdown links — open in editor
        if (/\.(md|markdown)$/i.test(href)) {
          e.preventDefault();
          const resolved = resolveRelativePath(filePath, href);
          const name = href.split(/[/\\]/).pop() ?? href;
          openTab(resolved, name, 'markdown');
          return;
        }

        // Other relative file links — try to open in appropriate viewer
        if (!href.startsWith('#') && !href.startsWith('mailto:')) {
          e.preventDefault();
          const resolved = resolveRelativePath(filePath, href);
          const name = href.split(/[/\\]/).pop() ?? href;
          const fileType = getKicadFileType(resolved);
          openTab(resolved, name, fileType !== 'unknown' ? fileType : undefined);
          return;
        }
      };

      return <a href={href} onClick={handleClick} {...props}>{children}</a>;
    },

    // Render pre blocks — pass through for mermaid handling
    pre({ children, ...props }: any) {
      return <pre {...props}>{children}</pre>;
    },
  };
}
