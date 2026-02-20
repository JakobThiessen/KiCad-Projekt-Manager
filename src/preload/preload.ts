import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

// Expose safe IPC methods to renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // Workspace
  openWorkspace: (workspacePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_WORKSPACE, workspacePath),
  openWorkspaceFile: (wsFilePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_WORKSPACE_FILE, wsFilePath),
  getWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORKSPACE),
  scanWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_WORKSPACE),
  addFolder: (folderPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_FOLDER, folderPath),
  removeFolder: (folderPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FOLDER, folderPath),
  excludeProject: (projectDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXCLUDE_PROJECT, projectDir),
  createWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_WORKSPACE),
  saveWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_WORKSPACE),
  saveWorkspaceAs: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_WORKSPACE_AS),

  // File operations
  readFile: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, filePath),
  readFileBase64: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_BASE64, filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_FILE, filePath, content),
  getFileTree: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_TREE),
  onFileChanged: (callback: (filePath: string) => void) => {
    const handler = (_event: any, filePath: string) => callback(filePath);
    ipcRenderer.on(IPC_CHANNELS.FILE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FILE_CHANGED, handler);
  },

  // Dialogs
  showOpenDialog: (options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options),

  // KiCad
  launchKicad: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_KICAD, filePath),

  // Shell integration
  showInExplorer: (filePath: string) =>
    ipcRenderer.send(IPC_CHANNELS.SHOW_IN_EXPLORER, filePath),
  openInDefaultApp: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_IN_DEFAULT_APP, filePath),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSettings: (settings: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, settings),

  // App-level settings & recent workspaces
  getAppSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_APP_SETTINGS),
  setAppSettings: (settings: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_APP_SETTINGS, settings),
  getRecentWorkspaces: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_WORKSPACES),
  clearRecentWorkspaces: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_RECENT_WORKSPACES),

  // Workspace filter
  setWorkspaceFilter: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_WORKSPACE_FILTER, enabled),

  // WASM binary loading
  getWasmBinary: (moduleName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WASM_BINARY, moduleName),

  // File utilities
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Window controls
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW),
  maximizeWindow: () => ipcRenderer.send(IPC_CHANNELS.MAXIMIZE_WINDOW),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW),
  setEditorPanel: (visible: boolean) => ipcRenderer.send(IPC_CHANNELS.SET_EDITOR_PANEL, visible),
});
