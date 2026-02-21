import React from 'react';
import { useAppStore } from '../store/appStore';

export function GlobalProgressBar() {
  const progress = useAppStore(s => s.globalProgress);

  if (!progress) return null;

  return (
    <div className="global-progress">
      <div className="global-progress-bar">
        <div className="global-progress-bar-fill" />
      </div>
    </div>
  );
}
