// Shared types between main and renderer processes

export interface KicadProject {
  name: string;
  path: string;            // absolute path to .kicad_pro
  directory: string;       // directory containing the project
  schematicFiles: string[];
  pcbFiles: string[];
  gerberFiles: string[];
  modelFiles: string[];    // 3D model files (STEP, VRML)
  kicadVersion?: string;   // KiCad version that created the project (e.g. "9.0")
  lastModified: number;    // timestamp
}

export interface WorkspaceState {
  filePath: string;           // path to the .kicadws workspace file
  folders: string[];          // project folder paths stored in the workspace
  projects: KicadProject[];
  kicadFilter: boolean;       // whether KiCad-only file filter is active
}

export interface WorkspaceFile {
  version: 1;
  folders: string[];
  excludedProjects: string[];
  settings: Partial<ProjectSettings>;
  kicadFilter?: boolean;
  /** Cached KiCad install path(s) saved per workspace, keyed by version string */
  kicadInstallPaths?: Record<string, string>;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  recentMaxCount: number;
  recentWorkspaces: string[];
}

/** Represents a detected KiCad installation on the system */
export interface KiCadInstallation {
  version: string;    // e.g. "9.0", "8.0"
  executablePath: string; // full path to kicad.exe
  installDir: string; // root install directory
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  extension?: string;
}

export type KicadFileType = 'schematic' | 'pcb' | 'project' | 'symbol-lib' | 'footprint' | 'gerber' | '3d-model' | 'pdf' | 'image' | 'markdown' | 'unknown';

export interface EditorTab {
  id: string;
  title: string;
  filePath: string;
  fileType: KicadFileType;
  isDirty: boolean;
  content?: string;
}

export interface ProjectSettings {
  kicadInstallPath: string;
  libraryPaths: string[];
  model3dPaths: string[];
  theme: 'dark' | 'light';
  gridSize: number;        // in mm, default 1.27
  autosaveInterval: number; // in seconds
  recentMaxCount: number;  // max entries in recent workspaces list
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Workspace
  OPEN_WORKSPACE: 'workspace:open',
  OPEN_WORKSPACE_FILE: 'workspace:openFile',
  GET_WORKSPACE: 'workspace:get',
  SCAN_WORKSPACE: 'workspace:scan',
  ADD_FOLDER: 'workspace:addFolder',
  REMOVE_FOLDER: 'workspace:removeFolder',
  EXCLUDE_PROJECT: 'workspace:excludeProject',
  CREATE_WORKSPACE: 'workspace:create',
  SAVE_WORKSPACE: 'workspace:save',
  SAVE_WORKSPACE_AS: 'workspace:saveAs',

  // File operations
  READ_FILE: 'file:read',
  READ_FILE_BASE64: 'file:readBase64',
  WRITE_FILE: 'file:write',
  WATCH_FILE: 'file:watch',
  FILE_CHANGED: 'file:changed',
  GET_FILE_TREE: 'file:tree',
  
  // Dialog
  SHOW_OPEN_DIALOG: 'dialog:open',
  SHOW_SAVE_DIALOG: 'dialog:save',

  // KiCad integration
  LAUNCH_KICAD: 'kicad:launch',
  KICAD_IPC_CONNECT: 'kicad:ipc:connect',
  KICAD_IPC_SEND: 'kicad:ipc:send',

  // Shell integration
  SHOW_IN_EXPLORER: 'shell:showInExplorer',
  OPEN_IN_DEFAULT_APP: 'shell:openInDefaultApp',

  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',

  // App-level settings / recent
  GET_APP_SETTINGS: 'app:getSettings',
  SET_APP_SETTINGS: 'app:setSettings',
  GET_RECENT_WORKSPACES: 'app:getRecent',
  ADD_RECENT_WORKSPACE: 'app:addRecent',
  CLEAR_RECENT_WORKSPACES: 'app:clearRecent',

  // Workspace filter
  SET_WORKSPACE_FILTER: 'workspace:setFilter',

  // File listing
  LIST_DIR: 'file:listDir',

  // WASM
  GET_WASM_BINARY: 'wasm:getBinary',

  // KiCad version detection
  KICAD_DETECT_INSTALLATIONS: 'kicad:detectInstallations',
  KICAD_LAUNCH_WITH_VERSION: 'kicad:launchWithVersion',
  KICAD_SAVE_INSTALL_PATHS: 'kicad:saveInstallPaths',
  KICAD_GET_INSTALL_PATHS: 'kicad:getInstallPaths',

  // Window
  MINIMIZE_WINDOW: 'window:minimize',
  MAXIMIZE_WINDOW: 'window:maximize',
  CLOSE_WINDOW: 'window:close',
  SET_EDITOR_PANEL: 'window:setEditorPanel',
} as const;
