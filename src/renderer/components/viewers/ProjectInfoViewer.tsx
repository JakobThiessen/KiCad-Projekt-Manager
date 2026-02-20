import React, { useMemo, useEffect, useState } from 'react';
import { ExternalLink, FileText, CircuitBoard, Cpu, Box, Layers, Calendar, FolderOpen, Info, BookOpen } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { MarkdownContent } from './MarkdownViewer';
import type { KicadProject } from '../../../shared/types';

interface ProjectInfoViewerProps {
  content: string;
  filePath: string;
}

interface KicadProJson {
  board?: {
    [key: string]: any;
  };
  boards?: string[];
  meta?: {
    filename?: string;
    version?: number;
  };
  net_settings?: any;
  pcbnew?: any;
  schematic?: {
    drawing?: any;
    meta?: any;
    [key: string]: any;
  };
  sheets?: Array<[string, string]>;
  text_variables?: Record<string, string>;
}

export function ProjectInfoViewer({ content, filePath }: ProjectInfoViewerProps) {
  const workspace = useAppStore(s => s.workspace);
  const openTab = useAppStore(s => s.openTab);

  // Find the matching project from workspace
  const project = useMemo(() => {
    const normPath = filePath.replace(/\\/g, '/');
    return workspace?.projects.find(p => p.path.replace(/\\/g, '/') === normPath) ?? null;
  }, [workspace, filePath]);

  // Parse the JSON content
  const proData = useMemo<KicadProJson | null>(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  const projectName = filePath.split(/[/\\]/).pop()?.replace('.kicad_pro', '') ?? 'Unknown';
  const projectDir = filePath.replace(/[/\\][^/\\]+$/, '');

  // Try to find and load a markdown file in the project directory
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [mdFileName, setMdFileName] = useState<string | null>(null);
  const [mdFilePath, setMdFilePath] = useState<string | null>(null);
  const fileTree = useAppStore(s => s.fileTree);

  useEffect(() => {
    setMdContent(null);
    setMdFileName(null);
    setMdFilePath(null);

    // Search the file tree for .md files in the project directory
    const normDir = projectDir.replace(/\\/g, '/');

    function findMdInDir(node: import('../../../shared/types').FileTreeNode): string | null {
      const nodeDir = node.path.replace(/\\/g, '/');
      if (node.type === 'directory') {
        // Check if this directory matches the project dir
        if (nodeDir === normDir) {
          // Look for .md files directly in this directory (prefer README.md)
          const mdFiles = (node.children ?? [])
            .filter(c => c.type === 'file' && /\.(md|markdown)$/i.test(c.name))
            .sort((a, b) => {
              // README.md first, then project-name.md, then others
              const aIsReadme = /^readme\.md$/i.test(a.name) ? 0 : 1;
              const bIsReadme = /^readme\.md$/i.test(b.name) ? 0 : 1;
              if (aIsReadme !== bIsReadme) return aIsReadme - bIsReadme;
              const aIsProj = a.name.toLowerCase().includes(projectName.toLowerCase()) ? 0 : 1;
              const bIsProj = b.name.toLowerCase().includes(projectName.toLowerCase()) ? 0 : 1;
              return aIsProj - bIsProj;
            });
          return mdFiles.length > 0 ? mdFiles[0].path : null;
        }
        // Recurse into children
        for (const child of node.children ?? []) {
          const found = findMdInDir(child);
          if (found) return found;
        }
      }
      return null;
    }

    if (fileTree) {
      const mdPath = findMdInDir(fileTree);
      if (mdPath) {
        const name = mdPath.split(/[/\\]/).pop() ?? 'README.md';
        setMdFileName(name);
        setMdFilePath(mdPath);
        window.api.readFile(mdPath)
          .then(text => setMdContent(text))
          .catch(() => setMdContent(null));
      }
    }
  }, [projectDir, fileTree, projectName]);

  // Extract key info from the project JSON
  const meta = proData?.meta;
  const textVars = proData?.text_variables ?? {};
  const sheets = proData?.sheets ?? [];

  return (
    <div className="viewer-container" style={{ overflow: 'auto' }}>
      <div className="toolbar">
        <button
          className="toolbar-btn"
          onClick={() => window.api.launchKicad(filePath)}
          title="Open Project in KiCad"
        >
          <ExternalLink size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
          {projectName}.kicad_pro
        </span>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <FolderOpen size={32} style={{ color: 'var(--accent-blue)' }} />
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {projectName}
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {projectDir}
            </div>
          </div>
        </div>

        {/* Project Info Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {project?.kicadVersion && (
            <InfoCard icon={<Info size={16} />} label="KiCad Version" value={`KiCad ${project.kicadVersion}`} />
          )}
          {project && (
            <InfoCard
              icon={<Calendar size={16} />}
              label="Last Modified"
              value={new Date(project.lastModified).toLocaleDateString('de-DE', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })}
            />
          )}
          {project && (
            <InfoCard
              icon={<Cpu size={16} style={{ color: 'var(--accent-green)' }} />}
              label="Schematics"
              value={`${project.schematicFiles.length} Datei${project.schematicFiles.length !== 1 ? 'en' : ''}`}
            />
          )}
          {project && (
            <InfoCard
              icon={<CircuitBoard size={16} style={{ color: 'var(--accent-blue)' }} />}
              label="PCB Layouts"
              value={`${project.pcbFiles.length} Datei${project.pcbFiles.length !== 1 ? 'en' : ''}`}
            />
          )}
          {project && project.gerberFiles.length > 0 && (
            <InfoCard
              icon={<Layers size={16} />}
              label="Gerber Files"
              value={`${project.gerberFiles.length} Datei${project.gerberFiles.length !== 1 ? 'en' : ''}`}
            />
          )}
          {project && project.modelFiles.length > 0 && (
            <InfoCard
              icon={<Box size={16} />}
              label="3D Models"
              value={`${project.modelFiles.length} Datei${project.modelFiles.length !== 1 ? 'en' : ''}`}
            />
          )}
        </div>

        {/* Text Variables */}
        {Object.keys(textVars).length > 0 && (
          <Section title="Text Variables">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Variable</th>
                  <th style={thStyle}>Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(textVars).map(([key, val]) => (
                  <tr key={key}>
                    <td style={tdStyle}><code style={{ color: 'var(--accent-purple)' }}>{key}</code></td>
                    <td style={tdStyle}>{val || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Sheets */}
        {sheets.length > 0 && (
          <Section title="Schematic Sheets">
            {sheets.map(([uuid, filename], idx) => (
              <div key={uuid} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                background: idx % 2 === 0 ? 'var(--bg-overlay)' : 'transparent',
              }}>
                <FileText size={14} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{filename}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Project Files */}
        {project && (
          <Section title="Project Files">
            {project.schematicFiles.length > 0 && (
              <FileGroup
                label="Schematics"
                icon={<Cpu size={14} style={{ color: 'var(--accent-green)' }} />}
                files={project.schematicFiles}
                fileType="schematic"
                onOpen={(fp, name) => openTab(fp, name, 'schematic')}
              />
            )}
            {project.pcbFiles.length > 0 && (
              <FileGroup
                label="PCB Layouts"
                icon={<CircuitBoard size={14} style={{ color: 'var(--accent-blue)' }} />}
                files={project.pcbFiles}
                fileType="pcb"
                onOpen={(fp, name) => openTab(fp, name, 'pcb')}
              />
            )}
            {project.gerberFiles.length > 0 && (
              <FileGroup
                label="Gerber Files"
                icon={<Layers size={14} style={{ color: 'var(--accent-yellow)' }} />}
                files={project.gerberFiles}
                fileType="gerber"
                onOpen={(fp, name) => openTab(fp, name, 'gerber')}
              />
            )}
            {project.modelFiles.length > 0 && (
              <FileGroup
                label="3D Models"
                icon={<Box size={14} style={{ color: 'var(--accent-purple)' }} />}
                files={project.modelFiles}
                fileType="3d-model"
                onOpen={(fp, name) => openTab(fp, name, '3d-model')}
              />
            )}
          </Section>
        )}

        {/* Project Description (Markdown) */}
        {mdContent && (
          <Section title={`Description — ${mdFileName}`}>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
            }}>
              <MarkdownContent content={mdContent} basePath={mdFilePath ?? undefined} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        marginBottom: '8px', paddingBottom: '4px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function FileGroup({
  label,
  icon,
  files,
  fileType,
  onOpen,
}: {
  label: string;
  icon: React.ReactNode;
  files: string[];
  fileType: string;
  onOpen: (filePath: string, name: string) => void;
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
        {label} ({files.length})
      </div>
      {files.map(fp => {
        const name = fp.split(/[/\\]/).pop() ?? fp;
        return (
          <div
            key={fp}
            onClick={() => onOpen(fp, name)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {icon}
            <span>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: '11px',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-color)',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-color)',
};
