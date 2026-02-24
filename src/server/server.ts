/**
 * Express companion server for browser mode.
 *
 * Run with:  node dist/server/server.js  (after tsc -p tsconfig.server.json)
 * Or in dev: ts-node src/server/server.ts
 *
 * The Vite dev server (port 5173) proxies /api to this server (port 3001),
 * so in dev you don't need CORS — but we enable it anyway for direct access.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as fsP from 'fs/promises';
import { spawn } from 'child_process';
import { WorkspaceManager } from '../main/workspaceManager';
import { FileWatcher } from '../main/fileWatcher';
import { AppSettings, KiCadInstallation } from '../shared/types';

const PORT = Number(process.env.SERVER_PORT ?? 3001);
const SETTINGS_FILE = path.join(
  process.env.APPDATA ?? process.env.HOME ?? '.',
  'kicad-project-manager',
  'app-settings.json'
);

// ── State ──────────────────────────────────────────────────────────────────

let workspaceManager: WorkspaceManager | null = null;
let fileWatcher: FileWatcher | null = null;
/** SSE client response objects */
const sseClients = new Set<Response>();
/** Resolves once the server's initial workspace auto-restore is complete */
let initialRestoreReady: Promise<void> = Promise.resolve();

function broadcastFileChanged(filePath: string) {
  for (const res of sseClients) {
    res.write(`event: fileChanged\ndata: ${filePath}\n\n`);
  }
}

// ── App settings helpers ───────────────────────────────────────────────────

function loadAppSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const p = JSON.parse(raw);
      return {
        theme: p.theme ?? 'dark',
        recentMaxCount: p.recentMaxCount ?? 10,
        recentWorkspaces: p.recentWorkspaces ?? [],
      };
    }
  } catch { /* ignore */ }
  return { theme: 'dark', recentMaxCount: 10, recentWorkspaces: [] };
}

function saveAppSettings(s: AppSettings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf-8');
}

function addRecentWorkspace(wsPath: string) {
  const s = loadAppSettings();
  const norm = wsPath.replace(/\\/g, '/');
  s.recentWorkspaces = s.recentWorkspaces.filter(p => p.replace(/\\/g, '/') !== norm);
  s.recentWorkspaces.unshift(wsPath);
  if (s.recentWorkspaces.length > s.recentMaxCount)
    s.recentWorkspaces = s.recentWorkspaces.slice(0, s.recentMaxCount);
  saveAppSettings(s);
}

// ── KiCad detection (same logic as main.ts) ───────────────────────────────

async function detectKicadInstallations(): Promise<KiCadInstallation[]> {
  const installations: KiCadInstallation[] = [];
  const searchRoots: string[] = [];

  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    searchRoots.push(path.join(pf, 'KiCad'), path.join(pf86, 'KiCad'));
  } else if (process.platform === 'darwin') {
    searchRoots.push('/Applications');
  } else {
    searchRoots.push('/usr/bin', '/usr/local/bin', '/opt/kicad');
  }

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      if (process.platform === 'win32') {
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const exePath = path.join(root, entry.name, 'bin', 'kicad.exe');
          if (fs.existsSync(exePath))
            installations.push({ version: entry.name, executablePath: exePath, installDir: path.join(root, entry.name) });
        }
      } else if (process.platform === 'darwin') {
        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.startsWith('KiCad')) continue;
          const appExe = path.join(root, entry.name, 'Contents', 'MacOS', 'kicad');
          if (fs.existsSync(appExe)) {
            const m = entry.name.match(/(\d+[\d.]*)/);
            installations.push({ version: m ? m[1] : entry.name, executablePath: appExe, installDir: path.join(root, entry.name) });
          }
        }
      } else {
        const linuxExe = path.join(root, 'kicad');
        if (fs.existsSync(linuxExe))
          installations.push({ version: 'system', executablePath: linuxExe, installDir: root });
      }
    } catch { /* ignore */ }
  }

  installations.sort((a, b) => {
    const av = a.version.split('.').map(Number);
    const bv = b.version.split('.').map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const diff = (bv[i] ?? 0) - (av[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return installations;
}

// ── File watcher helper ────────────────────────────────────────────────────

function startFileWatcher(folder: string) {
  if (fileWatcher) fileWatcher.close();
  fileWatcher = new FileWatcher(folder, broadcastFileChanged);
}

// ── Express app ────────────────────────────────────────────────────────────

const app = express();

// Multer for workspace file uploads (stored temporarily in OS temp dir)
const upload = multer({ dest: os.tmpdir() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve the built renderer — ONLY in production mode.
// In dev mode Vite (port 5173) serves the renderer; we must not shadow it
// with a stale dist/ build, which would deliver a bundle without the
// window.api polyfill and cause "Cannot read properties of undefined" errors.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Use process.cwd() so the path is correct regardless of whether we run
// via ts-node (cwd = project root) or compiled JS (cwd = project root).
const distRenderer = path.join(process.cwd(), 'dist', 'renderer');
if (IS_PRODUCTION && fs.existsSync(distRenderer)) {
  app.use(express.static(distRenderer));
  console.log('Serving static renderer from', distRenderer);
} else if (!IS_PRODUCTION) {
  console.log('Dev mode: static serving disabled — use http://localhost:5173 (Vite)');
}

// ── SSE endpoint ───────────────────────────────────────────────────────────

app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(':\n\n'); // keep-alive comment
  sseClients.add(res);
  const heartbeat = setInterval(() => res.write(':\n\n'), 20_000);
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
});

// ── Workspace routes ───────────────────────────────────────────────────────

app.post('/api/workspace/create', async (_req, res) => {
  workspaceManager = new WorkspaceManager();
  if (fileWatcher) { fileWatcher.close(); fileWatcher = null; }
  res.json(workspaceManager.getState());
});

app.post('/api/workspace/open-file', async (req, res) => {
  try {
    const { wsFilePath } = req.body as { wsFilePath: string };
    workspaceManager = new WorkspaceManager(wsFilePath);
    const ws = await workspaceManager.scan();
    addRecentWorkspace(wsFilePath);
    const folders = workspaceManager.getFolders();
    if (folders.length > 0) startFileWatcher(folders[0]);
    res.json(ws);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/workspace/open', async (req, res) => {
  try {
    const { workspacePath } = req.body as { workspacePath: string };
    const wsFilePath = path.join(workspacePath, 'workspace.kicadws');
    workspaceManager = new WorkspaceManager(wsFilePath);
    if (workspaceManager.getFolders().length === 0) workspaceManager.addFolder(workspacePath);
    const ws = await workspaceManager.scan();
    startFileWatcher(workspacePath);
    res.json(ws);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/workspace/get', async (_req, res) => {
  await initialRestoreReady;
  res.json(workspaceManager?.getState() ?? null);
});

app.post('/api/workspace/scan', async (_req, res) => {
  try {
    if (!workspaceManager) return res.json(null);
    res.json(await workspaceManager.scan());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/workspace/add-folder', async (req, res) => {
  try {
    const { folderPath } = req.body as { folderPath: string };
    if (!workspaceManager) workspaceManager = new WorkspaceManager();
    let resolved = folderPath;
    try { if (!fs.statSync(folderPath).isDirectory()) resolved = path.dirname(folderPath); } catch { /**/ }
    const added = workspaceManager.addFolder(resolved);
    const workspace = await workspaceManager.scan();
    const folders = workspaceManager.getFolders();
    if (folders.length > 0) startFileWatcher(folders[0]);
    res.json({ workspace, added });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/workspace/remove-folder', async (req, res) => {
  try {
    const { folderPath } = req.body as { folderPath: string };
    if (!workspaceManager) return res.json(null);
    workspaceManager.removeFolder(folderPath);
    res.json(await workspaceManager.scan());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/workspace/exclude-project', async (req, res) => {
  try {
    const { projectDir } = req.body as { projectDir: string };
    if (!workspaceManager) return res.json(null);
    workspaceManager.excludeProject(projectDir);
    res.json(await workspaceManager.scan());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/workspace/save', async (_req, res) => {
  try {
    if (!workspaceManager) return res.json({ success: false, error: 'No workspace open' });
    workspaceManager.save();
    const workspace = await workspaceManager.scan();
    res.json({ success: true, workspace });
  } catch (e) { res.status(500).json({ success: false, error: String(e) }); }
});

app.post('/api/workspace/save-as', async (req, res) => {
  try {
    if (!workspaceManager) return res.json({ success: false, error: 'No workspace open' });
    const { filePath } = req.body as { filePath?: string };
    if (!filePath) return res.json({ success: false, error: 'filePath required' });
    workspaceManager.saveTo(filePath);
    addRecentWorkspace(filePath);
    const workspace = await workspaceManager.scan();
    res.json({ success: true, workspace });
  } catch (e) { res.status(500).json({ success: false, error: String(e) }); }
});

app.get('/api/workspace/file-tree', async (_req, res) => {
  try {
    if (!workspaceManager) return res.json(null);
    res.json(await workspaceManager.getFileTree());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/workspace/set-filter', (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  workspaceManager?.setKicadFilter(enabled);
  res.json(true);
});

// ── File routes ────────────────────────────────────────────────────────────

app.get('/api/file/read', async (req, res) => {
  try {
    const filePath = req.query['path'] as string;
    const content = await fsP.readFile(filePath, 'utf-8');
    res.json(content);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/file/read-base64', async (req, res) => {
  try {
    const filePath = req.query['path'] as string;
    const buf = await fsP.readFile(filePath);
    res.json(buf.toString('base64'));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/file/write', async (req, res) => {
  try {
    const { filePath, content } = req.body as { filePath: string; content: string };
    await fsP.writeFile(filePath, content, 'utf-8');
    res.json(true);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/file/list-dir', async (req, res) => {
  try {
    const dirPath = req.query['path'] as string;
    const entries = await fsP.readdir(dirPath, { withFileTypes: true });
    res.json(entries.filter(e => e.isFile()).map(e => e.name));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Upload a local file — browser sends it as multipart, server saves to a temp
// staging dir and returns an absolute server-side path so subsequent API calls
// (e.g. openWorkspaceFile) can reference it.
const UPLOAD_DIR = path.join(os.tmpdir(), 'kicad-pm-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.post('/api/file/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const dest = path.join(UPLOAD_DIR, req.file.originalname);
    fs.renameSync(req.file.path, dest);
    res.json({ serverPath: dest });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── WASM route ─────────────────────────────────────────────────────────────

app.get('/api/wasm', async (req, res) => {
  try {
    const moduleName = req.query['module'] as string;
    // Look for WASM in node_modules first, then dist/renderer/assets
    const candidates = [
      path.resolve(__dirname, '../../node_modules', moduleName, 'dist', `${moduleName}.wasm`),
      path.resolve(__dirname, '../../dist/renderer/assets', `${moduleName}.wasm`),
    ];
    const wasmPath = candidates.find(p => fs.existsSync(p));
    if (!wasmPath) return res.status(404).json({ error: 'WASM not found' });
    const buf = await fsP.readFile(wasmPath);
    res.json(buf.toString('base64'));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── KiCad routes ──────────────────────────────────────────────────────────

app.get('/api/kicad/detect', async (_req, res) => {
  res.json(await detectKicadInstallations());
});

app.post('/api/kicad/launch', async (req, res) => {
  try {
    const { filePath } = req.body as { filePath: string };
    // Use xdg-open / open / start depending on OS
    const cmd = process.platform === 'win32' ? 'start' :
                 process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [filePath], { detached: true, stdio: 'ignore', shell: true }).unref();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: String(e) }); }
});

app.post('/api/kicad/launch-with-version', async (req, res) => {
  try {
    const { exePath, projectFilePath } = req.body as { exePath: string; projectFilePath: string };
    spawn(exePath, [projectFilePath], { detached: true, stdio: 'ignore', windowsHide: false } as any).unref();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: String(e) }); }
});

app.post('/api/kicad/save-install-paths', (req, res) => {
  const { paths } = req.body as { paths: Record<string, string> };
  workspaceManager?.saveKicadInstallPaths(paths);
  res.json(true);
});

app.get('/api/kicad/install-paths', (_req, res) => {
  res.json(workspaceManager?.getKicadInstallPaths() ?? {});
});

// ── Shell routes ───────────────────────────────────────────────────────────

app.post('/api/shell/show-in-explorer', (req, res) => {
  const { filePath } = req.body as { filePath: string };
  const cmd = process.platform === 'win32' ? `explorer /select,"${filePath}"` :
               process.platform === 'darwin' ? `open -R "${filePath}"` :
               `xdg-open "${path.dirname(filePath)}"`;
  spawn(cmd, { shell: true, detached: true, stdio: 'ignore' }).unref();
  res.json({ success: true });
});

app.post('/api/shell/open-in-default-app', async (req, res) => {
  try {
    const { filePath } = req.body as { filePath: string };
    const cmd = process.platform === 'win32' ? 'start' :
                 process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [filePath], { shell: true, detached: true, stdio: 'ignore' }).unref();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: String(e) }); }
});

// ── Settings routes ────────────────────────────────────────────────────────

app.get('/api/settings/app', (_req, res) => res.json(loadAppSettings()));

app.post('/api/settings/app', (req, res) => {
  const partial = req.body as Partial<AppSettings>;
  const merged: AppSettings = { ...loadAppSettings(), ...partial };
  if (merged.recentWorkspaces.length > merged.recentMaxCount)
    merged.recentWorkspaces = merged.recentWorkspaces.slice(0, merged.recentMaxCount);
  saveAppSettings(merged);
  res.json(merged);
});

app.get('/api/settings/project', (_req, res) => {
  res.json(workspaceManager?.getSettings() ?? null);
});

app.post('/api/settings/project', (req, res) => {
  workspaceManager?.updateSettings(req.body);
  res.json(true);
});

// ── Recent workspaces ──────────────────────────────────────────────────────

app.get('/api/recent', (_req, res) => res.json(loadAppSettings().recentWorkspaces));

app.post('/api/recent/clear', (_req, res) => {
  const s = loadAppSettings();
  s.recentWorkspaces = [];
  saveAppSettings(s);
  res.json(true);
});

// ── SPA fallback (production only) ───────────────────────────────────────

if (IS_PRODUCTION) {
  app.get('/{*path}', (_req, res, next) => {
    const indexHtml = path.join(distRenderer, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.sendFile(indexHtml);
    } else {
      next();
    }
  });
}

// ── Error handler ──────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// ── Startup ────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`KiCad PM server listening on http://localhost:${PORT}`);

  // Auto-restore last workspace — assign the promise so getWorkspace() can await it
  initialRestoreReady = (async () => {
    try {
      const s = loadAppSettings();
      if (s.recentWorkspaces.length > 0 && fs.existsSync(s.recentWorkspaces[0])) {
        workspaceManager = new WorkspaceManager(s.recentWorkspaces[0]);
        await workspaceManager.scan();
        const folders = workspaceManager.getFolders();
        if (folders.length > 0) startFileWatcher(folders[0]);
        console.log('Restored workspace:', s.recentWorkspaces[0]);
      }
    } catch (e) {
      console.error('Failed to restore last workspace:', e);
    }
  })();
});

export default app;
