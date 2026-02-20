import React, { useEffect, useState, Suspense, lazy } from 'react';
import { useAppStore } from '../store/appStore';

const SchematicViewer = lazy(() => import('./viewers/SchematicViewer').then(m => ({ default: m.SchematicViewer })));
const PcbViewer = lazy(() => import('./viewers/PcbViewer').then(m => ({ default: m.PcbViewer })));
const GerberViewer = lazy(() => import('./viewers/GerberViewer').then(m => ({ default: m.GerberViewer })));
const ModelViewer3D = lazy(() => import('./viewers/ModelViewer3D').then(m => ({ default: m.ModelViewer3D })));
const TextViewer = lazy(() => import('./viewers/TextViewer').then(m => ({ default: m.TextViewer })));
const ProjectInfoViewer = lazy(() => import('./viewers/ProjectInfoViewer').then(m => ({ default: m.ProjectInfoViewer })));
const PdfViewer = lazy(() => import('./viewers/PdfViewer').then(m => ({ default: m.PdfViewer })));
const ImageViewer = lazy(() => import('./viewers/ImageViewer').then(m => ({ default: m.ImageViewer })));
const MarkdownViewer = lazy(() => import('./viewers/MarkdownViewer').then(m => ({ default: m.MarkdownViewer })));

export function EditorArea() {
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const setTabContent = useAppStore(s => s.setTabContent);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const [loading, setLoading] = useState(false);

  // Load file content when tab becomes active
  useEffect(() => {
    if (!activeTab || activeTab.content !== undefined) return;

    setLoading(true);
    window.api.readFile(activeTab.filePath)
      .then(content => {
        setTabContent(activeTab.id, content);
      })
      .catch(err => {
        console.error('Failed to read file:', err);
        setTabContent(activeTab.id, `Error loading file: ${err}`);
      })
      .finally(() => setLoading(false));
  }, [activeTab?.id, activeTab?.content, setTabContent]);

  if (!activeTab) return null;

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <Suspense fallback={<div className="loading-spinner"><div className="spinner" /></div>}>
        {renderViewer(activeTab.fileType, activeTab.content ?? '', activeTab.filePath)}
      </Suspense>
    </div>
  );
}

function renderViewer(fileType: string, content: string, filePath: string) {
  switch (fileType) {
    case 'schematic':
      return <SchematicViewer content={content} filePath={filePath} />;
    case 'pcb':
      return <PcbViewer content={content} filePath={filePath} />;
    case 'gerber':
      return <GerberViewer content={content} filePath={filePath} />;
    case '3d-model':
      return <ModelViewer3D filePath={filePath} />;
    case 'project':
      return <ProjectInfoViewer content={content} filePath={filePath} />;
    case 'pdf':
      return <PdfViewer filePath={filePath} />;
    case 'image':
      return <ImageViewer filePath={filePath} />;
    case 'markdown':
      return <MarkdownViewer content={content} filePath={filePath} />;
    default:
      return <TextViewer content={content} filePath={filePath} />;
  }
}
