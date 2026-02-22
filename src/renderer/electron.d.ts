// Type declarations for the preload API exposed via contextBridge
import type { WorkspaceState, FileTreeNode, ProjectSettings, AppSettings, KiCadInstallation } from '../shared/types';

export interface ElectronAPI {
  // Workspace
  openWorkspace(workspacePath: string): Promise<WorkspaceState>;
  openWorkspaceFile(wsFilePath: string): Promise<WorkspaceState>;
  getWorkspace(): Promise<WorkspaceState | null>;
  scanWorkspace(): Promise<WorkspaceState>;
  addFolder(folderPath: string): Promise<{ workspace: WorkspaceState | null; added: boolean }>;
  removeFolder(folderPath: string): Promise<WorkspaceState | null>;
  excludeProject(projectDir: string): Promise<WorkspaceState | null>;
  createWorkspace(): Promise<WorkspaceState>;
  saveWorkspace(): Promise<{ success: boolean; canceled?: boolean; error?: string; workspace?: WorkspaceState }>;
  saveWorkspaceAs(): Promise<{ success: boolean; canceled?: boolean; error?: string; workspace?: WorkspaceState }>;

  // File operations
  readFile(filePath: string): Promise<string>;
  readFileBase64(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<boolean>;
  getFileTree(): Promise<FileTreeNode>;
  onFileChanged(callback: (filePath: string) => void): () => void;

  // Dialogs
  showOpenDialog(options?: any): Promise<{ canceled: boolean; filePaths: string[] }>;

  // KiCad
  launchKicad(filePath: string): Promise<{ success: boolean; error?: string }>;
  detectKicadInstallations(): Promise<KiCadInstallation[]>;
  launchKicadWithVersion(exePath: string, projectFilePath: string): Promise<{ success: boolean; error?: string }>;
  saveKicadInstallPaths(paths: Record<string, string>): Promise<boolean>;
  getKicadInstallPaths(): Promise<Record<string, string>>;

  // Shell integration
  showInExplorer(filePath: string): void;
  openInDefaultApp(filePath: string): Promise<{ success: boolean; error?: string }>;

  // Settings
  getSettings(): Promise<ProjectSettings | null>;
  setSettings(settings: Partial<ProjectSettings>): Promise<boolean>;

  // App-level settings & recent workspaces
  getAppSettings(): Promise<AppSettings>;
  setAppSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  getRecentWorkspaces(): Promise<string[]>;
  clearRecentWorkspaces(): Promise<boolean>;

  // Workspace filter
  setWorkspaceFilter(enabled: boolean): Promise<boolean>;

  // WASM binary loading
  getWasmBinary(moduleName: string): Promise<string>;

  // File utilities
  getPathForFile(file: File): string;

  // Window controls
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  setEditorPanel(visible: boolean): void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
