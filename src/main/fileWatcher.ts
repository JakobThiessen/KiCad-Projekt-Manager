import * as chokidar from 'fs';
import * as path from 'path';
import { KICAD_EXTENSIONS, GERBER_EXTENSIONS } from '../shared/fileTypes';

/**
 * Watches a workspace directory for file changes.
 * Uses Node.js fs.watch recursively.
 */
export class FileWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private rootPath: string,
    private onChange: (filePath: string) => void,
  ) {
    this.start();
  }

  private start(): void {
    try {
      this.watcher = chokidar.watch(this.rootPath, {
        recursive: true,
      });

      this.watcher.on('change', (_event: string, filename: string | Buffer | null) => {
        if (!filename || typeof filename !== 'string') return;
        const fullPath = path.join(this.rootPath, filename);
        const ext = path.extname(filename).toLowerCase();

        // Only notify about relevant file types
        const allExts = [...KICAD_EXTENSIONS, ...GERBER_EXTENSIONS];
        if (!allExts.includes(ext as any)) return;

        // Debounce: wait 500ms after last change
        const existing = this.debounceTimers.get(fullPath);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(fullPath, setTimeout(() => {
          this.debounceTimers.delete(fullPath);
          this.onChange(fullPath);
        }, 500));
      });
    } catch (error) {
      console.error('Failed to start file watcher:', error);
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
