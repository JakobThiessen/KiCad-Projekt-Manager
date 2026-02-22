import React from 'react';
import { KiCanvasViewer } from './KiCanvasViewer';

interface PcbViewerProps {
  content: string;
  filePath: string;
}

export function PcbViewer({ content, filePath }: PcbViewerProps) {
  return <KiCanvasViewer content={content} filePath={filePath} fileType="pcb" />;
}
