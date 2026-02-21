import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceManager } from './workspaceManager';
import { FileWatcher } from './fileWatcher';
import { IPC_CHANNELS, AppSettings } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let workspaceManager: WorkspaceManager | null = null;
let fileWatcher: FileWatcher | null = null;

const isDev = !app.isPackaged;

// --- App-level settings (stored in userData) ---
const APP_SETTINGS_FILE = () => path.join(app.getPath('userData'), 'app-settings.json');

function loadAppSettings(): AppSettings {
  try {
    if (fs.existsSync(APP_SETTINGS_FILE())) {
      const raw = fs.readFileSync(APP_SETTINGS_FILE(), 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        theme: parsed.theme ?? 'dark',
        recentMaxCount: parsed.recentMaxCount ?? 10,
        recentWorkspaces: parsed.recentWorkspaces ?? [],
      };
    }
  } catch { /* ignore */ }
  return { theme: 'dark', recentMaxCount: 10, recentWorkspaces: [] };
}

function saveAppSettings(settings: AppSettings): void {
  try {
    fs.writeFileSync(APP_SETTINGS_FILE(), JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save app settings:', e);
  }
}

function addRecentWorkspace(wsPath: string): void {
  const settings = loadAppSettings();
  const norm = wsPath.replace(/\\/g, '/');
  settings.recentWorkspaces = settings.recentWorkspaces.filter(
    p => p.replace(/\\/g, '/') !== norm
  );
  settings.recentWorkspaces.unshift(wsPath);
  if (settings.recentWorkspaces.length > settings.recentMaxCount) {
    settings.recentWorkspaces = settings.recentWorkspaces.slice(0, settings.recentMaxCount);
  }
  saveAppSettings(settings);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    frame: false,           // Custom titlebar
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', '..', '..', 'assets', 'icon.png'),
    show: false,
  });

  // Show when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Prevent navigation on file drop or other external navigation
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Set CSP for production only
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src blob:; frame-src blob:;"
          ],
        },
      });
    });
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC Handlers ---

function setupIpcHandlers(): void {
  // Window controls
  ipcMain.on(IPC_CHANNELS.MINIMIZE_WINDOW, () => mainWindow?.minimize());
  ipcMain.on(IPC_CHANNELS.MAXIMIZE_WINDOW, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on(IPC_CHANNELS.CLOSE_WINDOW, () => mainWindow?.close());

  // Editor panel toggle — resize window
  let savedBounds: Electron.Rectangle | null = null;
  ipcMain.on(IPC_CHANNELS.SET_EDITOR_PANEL, (_event, visible: boolean) => {
    if (!mainWindow) return;
    if (!visible) {
      // Collapse: save current bounds, shrink to sidebar-only width
      savedBounds = mainWindow.getBounds();
      const sidebarWidth = 430; // sidebar + some padding
      mainWindow.setMinimumSize(430, 400);
      mainWindow.setBounds({
        x: savedBounds.x,
        y: savedBounds.y,
        width: sidebarWidth,
        height: savedBounds.height,
      }, true);
    } else {
      // Expand: restore saved bounds
      mainWindow.setMinimumSize(1024, 700);
      if (savedBounds) {
        mainWindow.setBounds(savedBounds, true);
        savedBounds = null;
      }
    }
  });

  // Generic open dialog — caller controls all options
  ipcMain.handle(IPC_CHANNELS.SHOW_OPEN_DIALOG, async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open',
      ...options,
    });
    return result;
  });

  // Open a .kicadws workspace file
  ipcMain.handle(IPC_CHANNELS.OPEN_WORKSPACE_FILE, async (_event, wsFilePath: string) => {
    workspaceManager = new WorkspaceManager(wsFilePath);
    const workspace = await workspaceManager.scan();
    
    // Add to recent list
    addRecentWorkspace(wsFilePath);
    
    // Set up file watchers for all folders
    if (fileWatcher) fileWatcher.close();
    const folders = workspaceManager.getFolders();
    if (folders.length > 0) {
      fileWatcher = new FileWatcher(folders[0], (changedPath: string) => {
        mainWindow?.webContents.send(IPC_CHANNELS.FILE_CHANGED, changedPath);
      });
    }

    return workspace;
  });

  // Legacy: open workspace from directory (now creates a .kicadws in that dir)
  ipcMain.handle(IPC_CHANNELS.OPEN_WORKSPACE, async (_event, workspacePath: string) => {
    const wsFilePath = path.join(workspacePath, 'workspace.kicadws');
    workspaceManager = new WorkspaceManager(wsFilePath);
    // If the workspace file is new and has no folders, add the directory itself
    if (workspaceManager.getFolders().length === 0) {
      workspaceManager.addFolder(workspacePath);
    }
    const workspace = await workspaceManager.scan();
    
    if (fileWatcher) fileWatcher.close();
    fileWatcher = new FileWatcher(workspacePath, (changedPath: string) => {
      mainWindow?.webContents.send(IPC_CHANNELS.FILE_CHANGED, changedPath);
    });

    return workspace;
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_WORKSPACE, async () => {
    if (!workspaceManager) return null;
    return workspaceManager.scan();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_FOLDER, async (_event, folderPath: string) => {
    console.log('[D&D main] addFolder called with:', folderPath);
    // Auto-create untitled workspace if none open
    if (!workspaceManager) {
      console.log('[D&D main] No workspace manager — creating new one');
      workspaceManager = new WorkspaceManager();
    }
    // If the dropped path is a file, use its parent directory
    let resolvedPath = folderPath;
    try {
      const stat = fs.statSync(folderPath);
      console.log('[D&D main] stat result — isDirectory:', stat.isDirectory(), 'isFile:', stat.isFile());
      if (!stat.isDirectory()) {
        resolvedPath = path.dirname(folderPath);
        console.log('[D&D main] Not a directory, using parent:', resolvedPath);
      }
    } catch (err) {
      console.log('[D&D main] stat failed:', err);
    }
    console.log('[D&D main] Adding folder:', resolvedPath);
    const added = workspaceManager.addFolder(resolvedPath);
    console.log('[D&D main] addFolder returned:', added);
    const workspace = await workspaceManager.scan();
    console.log('[D&D main] scan result — folders:', workspace?.folders, 'projects:', workspace?.projects?.length);
    return { workspace, added };
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_FOLDER, async (_event, folderPath: string) => {
    if (!workspaceManager) return null;
    workspaceManager.removeFolder(folderPath);
    return workspaceManager.scan();
  });

  ipcMain.handle(IPC_CHANNELS.EXCLUDE_PROJECT, async (_event, projectDir: string) => {
    if (!workspaceManager) return null;
    workspaceManager.excludeProject(projectDir);
    return workspaceManager.scan();
  });

  // Create a new (untitled) workspace — no file path needed
  ipcMain.handle(IPC_CHANNELS.CREATE_WORKSPACE, async () => {
    workspaceManager = new WorkspaceManager(); // untitled
    if (fileWatcher) fileWatcher.close();
    fileWatcher = null;
    return workspaceManager.getState();
  });

  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, () => {
    return workspaceManager?.getState() ?? null;
  });

  // Save the workspace file — if untitled, prompt for location
  ipcMain.handle(IPC_CHANNELS.SAVE_WORKSPACE, async () => {
    if (!workspaceManager) return { success: false, error: 'No workspace open' };
    if (workspaceManager.isUntitled()) {
      // Prompt for save location
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Save Workspace',
        defaultPath: 'workspace.kicadws',
        filters: [{ name: 'KiCad Workspace', extensions: ['kicadws'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      workspaceManager.saveTo(result.filePath);
      addRecentWorkspace(result.filePath);
      const ws = await workspaceManager.scan();
      return { success: true, workspace: ws };
    }
    workspaceManager.save();
    return { success: true, workspace: workspaceManager.getState() };
  });

  // Save workspace as a new .kicadws file
  ipcMain.handle(IPC_CHANNELS.SAVE_WORKSPACE_AS, async () => {
    if (!workspaceManager) return { success: false, error: 'No workspace open' };
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Workspace As…',
      defaultPath: 'workspace.kicadws',
      filters: [
        { name: 'KiCad Workspace', extensions: ['kicadws'] },
      ],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      workspaceManager.saveTo(result.filePath);
      addRecentWorkspace(result.filePath);
      const ws = await workspaceManager.scan();
      return { success: true, workspace: ws };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // File operations
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, filePath: string) => {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.READ_FILE_BASE64, async (_event, filePath: string) => {
    const fs = await import('fs/promises');
    const buf = await fs.readFile(filePath);
    return buf.toString('base64');
  });

  ipcMain.handle(IPC_CHANNELS.WRITE_FILE, async (_event, filePath: string, content: string) => {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  });

  // WASM binary loading - reads WASM files from node_modules (dev) or dist assets (production)
  ipcMain.handle(IPC_CHANNELS.GET_WASM_BINARY, async (_event, moduleName: string) => {
    const fsP = await import('fs/promises');
    let wasmPath: string;
    if (isDev) {
      wasmPath = path.join(__dirname, '..', '..', '..', 'node_modules', moduleName, 'dist', `${moduleName}.wasm`);
    } else {
      // In production, WASM was copied to dist/renderer/assets/ by the Vite plugin
      wasmPath = path.join(app.getAppPath(), 'dist', 'renderer', 'assets', `${moduleName}.wasm`);
    }
    const buf = await fsP.readFile(wasmPath);
    return buf.toString('base64');
  });

  ipcMain.handle(IPC_CHANNELS.GET_FILE_TREE, async () => {
    if (!workspaceManager) return null;
    return workspaceManager.getFileTree();
  });

  // KiCad launch
  ipcMain.handle(IPC_CHANNELS.LAUNCH_KICAD, async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Shell integration
  ipcMain.on(IPC_CHANNELS.SHOW_IN_EXPLORER, (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_IN_DEFAULT_APP, async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return workspaceManager?.getSettings() ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, async (_event, settings: any) => {
    workspaceManager?.updateSettings(settings);
    return true;
  });

  // App-level settings (theme, recentMaxCount)
  ipcMain.handle(IPC_CHANNELS.GET_APP_SETTINGS, () => {
    return loadAppSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SET_APP_SETTINGS, (_event, partial: Partial<AppSettings>) => {
    const current = loadAppSettings();
    const merged = { ...current, ...partial };
    // Trim recent list if max count reduced
    if (merged.recentWorkspaces.length > merged.recentMaxCount) {
      merged.recentWorkspaces = merged.recentWorkspaces.slice(0, merged.recentMaxCount);
    }
    saveAppSettings(merged);
    return merged;
  });

  ipcMain.handle(IPC_CHANNELS.GET_RECENT_WORKSPACES, () => {
    return loadAppSettings().recentWorkspaces;
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_RECENT_WORKSPACES, () => {
    const settings = loadAppSettings();
    settings.recentWorkspaces = [];
    saveAppSettings(settings);
    return true;
  });

  // Workspace filter toggle
  ipcMain.handle(IPC_CHANNELS.SET_WORKSPACE_FILTER, (_event, enabled: boolean) => {
    if (workspaceManager) {
      workspaceManager.setKicadFilter(enabled);
    }
    return true;
  });
}

// --- App Lifecycle ---

app.whenReady().then(async () => {
  createWindow();
  setupIpcHandlers();

  // Restore last workspace on startup
  try {
    const settings = loadAppSettings();
    if (settings.recentWorkspaces.length > 0) {
      const lastWs = settings.recentWorkspaces[0];
      if (fs.existsSync(lastWs)) {
        workspaceManager = new WorkspaceManager(lastWs);
        await workspaceManager.scan();
        // Set up file watchers
        const folders = workspaceManager.getFolders();
        if (folders.length > 0 && mainWindow) {
          if (fileWatcher) fileWatcher.close();
          fileWatcher = new FileWatcher(folders[0], (changedPath: string) => {
            mainWindow?.webContents.send(IPC_CHANNELS.FILE_CHANGED, changedPath);
          });
        }
      }
    }
  } catch (e) {
    console.error('Failed to restore last workspace:', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  fileWatcher?.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
