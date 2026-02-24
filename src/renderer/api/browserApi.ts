/**
 * Browser-mode implementation of ElectronAPI.
 * Each method maps to an HTTP endpoint on the companion Express server
 * (src/server/server.ts, default port 3001).
 *
 * Features not available in browser mode (window controls, KiCad launch, explorer)
 * are stubbed so they degrade gracefully.
 */
import type { ElectronAPI } from '../electron.d';
import type { WorkspaceState, FileTreeNode, ProjectSettings, AppSettings, KiCadInstallation } from '../../shared/types';

// In dev mode Vite proxies /api → http://localhost:3001
// In production the Express server itself serves the built files,
// so /api routes go directly to Express.  Either way, relative paths work.
const BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

// ── Helpers ────────────────────────────────────────────────────────────────

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const search = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${BASE}${path}${search}`);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── SSE for file-change events ─────────────────────────────────────────────

let _evtSource: EventSource | null = null;
const _fileChangedListeners = new Set<(path: string) => void>();

function ensureEventSource() {
  if (_evtSource) return;
  _evtSource = new EventSource(`${BASE}/api/events`);
  _evtSource.addEventListener('fileChanged', (e: MessageEvent) => {
    _fileChangedListeners.forEach(cb => cb(e.data as string));
  });
  _evtSource.onerror = () => {
    _evtSource?.close();
    _evtSource = null;
    // Reconnect after 3 s
    setTimeout(ensureEventSource, 3000);
  };
}

// ── showOpenDialog via <input type="file"> ─────────────────────────────────

function browserShowOpenDialog(
  options?: { filters?: { name: string; extensions: string[] }[]; properties?: string[] }
): Promise<{ canceled: boolean; filePaths: string[] }> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.properties?.includes('openDirectory')) {
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    }
    if (options?.filters?.length) {
      const exts = options.filters.flatMap(f => f.extensions.map(e => `.${e}`));
      input.accept = exts.join(',');
    }
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        resolve({ canceled: true, filePaths: [] });
        return;
      }
      // In the browser we only get File objects — the server can't use these paths.
      // We upload the file content to the server and it returns a virtual path.
      const uploads = files.map(f => {
        const fd = new FormData();
        fd.append('file', f);
        return fetch(`${BASE}/api/file/upload`, { method: 'POST', body: fd })
          .then(r => r.json() as Promise<{ serverPath: string }>)
          .then(j => j.serverPath);
      });
      Promise.all(uploads)
        .then(paths => resolve({ canceled: false, filePaths: paths }))
        .catch(() => resolve({ canceled: true, filePaths: [] }));
    };
    input.oncancel = () => resolve({ canceled: true, filePaths: [] });
    input.click();
  });
}

// ── ElectronAPI implementation ─────────────────────────────────────────────

export const browserApi: ElectronAPI = {
  // Workspace
  openWorkspace: (workspacePath) =>
    post<WorkspaceState>('/api/workspace/open', { workspacePath }),

  openWorkspaceFile: (wsFilePath) =>
    post<WorkspaceState>('/api/workspace/open-file', { wsFilePath }),

  getWorkspace: () =>
    get<WorkspaceState | null>('/api/workspace/get'),

  scanWorkspace: () =>
    post<WorkspaceState>('/api/workspace/scan'),

  addFolder: (folderPath) =>
    post<{ workspace: WorkspaceState | null; added: boolean }>('/api/workspace/add-folder', { folderPath }),

  removeFolder: (folderPath) =>
    post<WorkspaceState | null>('/api/workspace/remove-folder', { folderPath }),

  excludeProject: (projectDir) =>
    post<WorkspaceState | null>('/api/workspace/exclude-project', { projectDir }),

  createWorkspace: () =>
    post<WorkspaceState>('/api/workspace/create'),

  saveWorkspace: () =>
    post<{ success: boolean; canceled?: boolean; error?: string; workspace?: WorkspaceState }>('/api/workspace/save'),

  saveWorkspaceAs: () =>
    // In browser mode the server picks its own path — inform user
    post<{ success: boolean; canceled?: boolean; error?: string; workspace?: WorkspaceState }>('/api/workspace/save-as'),

  // File operations
  readFile: (filePath) =>
    get<string>('/api/file/read', { path: filePath }),

  readFileBase64: (filePath) =>
    get<string>('/api/file/read-base64', { path: filePath }),

  writeFile: (filePath, content) =>
    post<boolean>('/api/file/write', { filePath, content }),

  listDir: (dirPath) =>
    get<string[]>('/api/file/list-dir', { path: dirPath }),

  getFileTree: () =>
    get<FileTreeNode>('/api/workspace/file-tree'),

  onFileChanged: (callback) => {
    ensureEventSource();
    _fileChangedListeners.add(callback);
    return () => _fileChangedListeners.delete(callback);
  },

  // Dialogs
  showOpenDialog: (options) => browserShowOpenDialog(options),

  // KiCad — only possible because the server runs on the same machine
  launchKicad: (filePath) =>
    post<{ success: boolean; error?: string }>('/api/kicad/launch', { filePath }),

  detectKicadInstallations: () =>
    get<KiCadInstallation[]>('/api/kicad/detect'),

  launchKicadWithVersion: (exePath, projectFilePath) =>
    post<{ success: boolean; error?: string }>('/api/kicad/launch-with-version', { exePath, projectFilePath }),

  saveKicadInstallPaths: (paths) =>
    post<boolean>('/api/kicad/save-install-paths', { paths }),

  getKicadInstallPaths: () =>
    get<Record<string, string>>('/api/kicad/install-paths'),

  // Shell
  showInExplorer: (filePath) => {
    fetch(`${BASE}/api/shell/show-in-explorer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    }).catch(() => {/* fire-and-forget */});
  },

  openInDefaultApp: (filePath) =>
    post<{ success: boolean; error?: string }>('/api/shell/open-in-default-app', { filePath }),

  // Settings
  getSettings: () =>
    get<ProjectSettings | null>('/api/settings/project'),

  setSettings: (settings) =>
    post<boolean>('/api/settings/project', settings),

  getAppSettings: () =>
    get<AppSettings>('/api/settings/app'),

  setAppSettings: (settings) =>
    post<AppSettings>('/api/settings/app', settings),

  getRecentWorkspaces: () =>
    get<string[]>('/api/recent'),

  clearRecentWorkspaces: () =>
    post<boolean>('/api/recent/clear'),

  // Workspace filter
  setWorkspaceFilter: (enabled) =>
    post<boolean>('/api/workspace/set-filter', { enabled }),

  // WASM
  getWasmBinary: (moduleName) =>
    get<string>('/api/wasm', { module: moduleName }),

  // File utilities (browser: File.name gives only the filename, not the full path;
  // the server uses /api/file/upload to receive the bytes and hand back a server path)
  getPathForFile: (file) => file.name,

  // Window controls — no-ops in browser
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => window.close(),
  setEditorPanel: () => {},
};
