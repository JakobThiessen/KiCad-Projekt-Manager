import React from 'react';
import { KiCanvasViewer } from './KiCanvasViewer';

interface SchematicViewerProps {
  content: string;
  filePath: string;
}

export function SchematicViewer({ content, filePath }: SchematicViewerProps) {
  return <KiCanvasViewer content={content} filePath={filePath} fileType="schematic" />;
}
