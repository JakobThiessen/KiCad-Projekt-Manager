import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { KicadProject, WorkspaceState, WorkspaceFile, FileTreeNode, ProjectSettings } from '../shared/types';
import { isKicadProject, getKicadFileType, KICAD_EXTENSIONS, GERBER_EXTENSIONS, MODEL_3D_EXTENSIONS } from '../shared/fileTypes';

const DEFAULT_SETTINGS: ProjectSettings = {
  kicadInstallPath: '',
  libraryPaths: [],
  model3dPaths: [],
  theme: 'dark',
  gridSize: 1.27,
  autosaveInterval: 120,
  recentMaxCount: 10,
};

const EMPTY_WORKSPACE_FILE: WorkspaceFile = {
  version: 1,
  folders: [],
  excludedProjects: [],
  settings: {},
};

export class WorkspaceManager {
  private wsFilePath: string;             // absolute path to .kicadws file (empty = untitled)
  private wsData: WorkspaceFile;
  private projects: KicadProject[] = [];
  private settings: ProjectSettings = { ...DEFAULT_SETTINGS };

  constructor(wsFilePath: string = '') {
    this.wsFilePath = wsFilePath;
    this.wsData = { ...EMPTY_WORKSPACE_FILE, folders: [], excludedProjects: [] };
    if (wsFilePath) {
      this.load();
    }
  }

  isUntitled(): boolean {
    return !this.wsFilePath;
  }

  /** Load workspace data from .kicadws file */
  private load(): void {
    try {
      if (fsSync.existsSync(this.wsFilePath)) {
        const raw = fsSync.readFileSync(this.wsFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as WorkspaceFile;
        this.wsData = {
          version: parsed.version ?? 1,
          folders: parsed.folders ?? [],
          excludedProjects: parsed.excludedProjects ?? [],
          settings: parsed.settings ?? {},
          kicadFilter: parsed.kicadFilter ?? false,
          kicadInstallPaths: parsed.kicadInstallPaths ?? {},
        };
        this.settings = { ...DEFAULT_SETTINGS, ...this.wsData.settings };
      }
    } catch {
      this.wsData = { ...EMPTY_WORKSPACE_FILE, folders: [], excludedProjects: [] };
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /** Persist the workspace file to disk */
  save(): boolean {
    if (!this.wsFilePath) return false; // untitled — nothing to save
    this.wsData.settings = this.settings;
    try {
      const dir = path.dirname(this.wsFilePath);
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
      fsSync.writeFileSync(this.wsFilePath, JSON.stringify(this.wsData, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save workspace file:', error);
      return false;
    }
  }

  /** Save to a new file path */
  saveTo(newPath: string): boolean {
    this.wsFilePath = newPath;
    return this.save();
  }

  getFilePath(): string {
    return this.wsFilePath;
  }

  getState(): WorkspaceState {
    return {
      filePath: this.wsFilePath,
      folders: [...this.wsData.folders],
      projects: this.projects,
      kicadFilter: this.wsData.kicadFilter ?? false,
    };
  }

  getFolders(): string[] {
    return [...this.wsData.folders];
  }

  /** Add a folder to the workspace. Returns true if added, false if duplicate. */
  addFolder(folderPath: string): boolean {
    const normalized = folderPath.replace(/\\/g, '/');
    if (this.wsData.folders.some(p => p.replace(/\\/g, '/') === normalized)) {
      return false; // duplicate
    }
    this.wsData.folders.push(folderPath);
    return true;
  }

  removeFolder(folderPath: string): void {
    const normalized = folderPath.replace(/\\/g, '/');
    this.wsData.folders = this.wsData.folders.filter(
      p => p.replace(/\\/g, '/') !== normalized
    );
  }

  excludeProject(projectDir: string): void {
    const normalized = projectDir.replace(/\\/g, '/');
    if (!this.wsData.excludedProjects.some(p => p.replace(/\\/g, '/') === normalized)) {
      this.wsData.excludedProjects.push(projectDir);
    }
  }

  /** Check if a project directory is already covered by an existing folder */
  hasProjectDir(projectDir: string): boolean {
    const normalized = projectDir.replace(/\\/g, '/');
    return this.projects.some(p => p.directory.replace(/\\/g, '/') === normalized);
  }

  getSettings(): ProjectSettings {
    return this.settings;
  }

  updateSettings(partial: Partial<ProjectSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.save();
  }

  setKicadFilter(enabled: boolean): void {
    this.wsData.kicadFilter = enabled;
  }

  getKicadInstallPaths(): Record<string, string> {
    return this.wsData.kicadInstallPaths ?? {};
  }

  saveKicadInstallPaths(paths: Record<string, string>): void {
    this.wsData.kicadInstallPaths = { ...this.wsData.kicadInstallPaths, ...paths };
    this.save();
  }

  /** Scan all workspace folders for KiCad projects */
  async scan(): Promise<WorkspaceState> {
    this.projects = [];
    for (const folder of this.wsData.folders) {
      await this.scanDirectory(folder);
    }
    return this.getState();
  }

  private async scanDirectory(dirPath: string, depth = 0): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const proFile = entries.find(e => e.isFile() && isKicadProject(e.name));

      if (proFile) {
        const normalizedDir = dirPath.replace(/\\/g, '/');
        const isExcluded = this.wsData.excludedProjects.some(
          p => p.replace(/\\/g, '/') === normalizedDir
        );
        // Duplicate check: skip if already found
        const isDuplicate = this.projects.some(
          p => p.directory.replace(/\\/g, '/') === normalizedDir
        );
        if (!isExcluded && !isDuplicate) {
          const project = await this.buildProject(dirPath, proFile.name, entries);
          this.projects.push(project);
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.scanDirectory(path.join(dirPath, entry.name), depth + 1);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  private async buildProject(
    dirPath: string,
    proFileName: string,
    entries: fsSync.Dirent[]
  ): Promise<KicadProject> {
    const proPath = path.join(dirPath, proFileName);
    const stat = await fs.stat(proPath);

    const schematicFiles: string[] = [];
    const pcbFiles: string[] = [];
    const gerberFiles: string[] = [];
    const modelFiles: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const fullPath = path.join(dirPath, entry.name);

      if (ext === '.kicad_sch') schematicFiles.push(fullPath);
      else if (ext === '.kicad_pcb') pcbFiles.push(fullPath);
      else if (GERBER_EXTENSIONS.includes(ext as any)) gerberFiles.push(fullPath);
      else if (MODEL_3D_EXTENSIONS.includes(ext as any)) modelFiles.push(fullPath);
    }

    // Also check for gerber subdirectory
    const gerberDir = path.join(dirPath, 'gerber');
    if (fsSync.existsSync(gerberDir)) {
      try {
        const gerberEntries = await fs.readdir(gerberDir);
        for (const gf of gerberEntries) {
          const ext = path.extname(gf).toLowerCase();
          if (GERBER_EXTENSIONS.includes(ext as any)) {
            gerberFiles.push(path.join(gerberDir, gf));
          }
        }
      } catch { /* ignore */ }
    }

    // Try to extract KiCad version from a schematic or PCB file
    let kicadVersion: string | undefined;
    const versionSourceFile = schematicFiles[0] || pcbFiles[0];
    console.log('[version] Checking for version in:', versionSourceFile);
    if (versionSourceFile) {
      try {
        const content = await fs.readFile(versionSourceFile, 'utf-8');
        const header = content.substring(0, 512);
        const match = header.match(/\(generator_version\s+"([^"]+)"\)/);
        console.log('[version] header match:', match?.[1]);
        if (match) {
          kicadVersion = match[1];
        }
      } catch (err) {
        console.log('[version] Error reading version:', err);
      }
    }

    return {
      name: path.basename(proFileName, '.kicad_pro'),
      path: proPath,
      directory: dirPath,
      schematicFiles,
      pcbFiles,
      gerberFiles,
      modelFiles,
      kicadVersion,
      lastModified: stat.mtimeMs,
    };
  }

  /** Build a file tree for the sidebar explorer */
  async getFileTree(): Promise<FileTreeNode> {
    const folders = this.wsData.folders;
    if (folders.length === 0) {
      return { name: 'Workspace', path: '', type: 'directory', children: [] };
    }
    if (folders.length === 1) {
      return this.buildFileTree(folders[0]);
    }

    // Multi-folder: create virtual container
    const children: FileTreeNode[] = [];
    for (const folder of folders) {
      children.push(await this.buildFileTree(folder));
    }
    return {
      name: 'Workspace',
      path: '',
      type: 'directory',
      children,
    };
  }

  private async buildFileTree(dirPath: string, depth = 0): Promise<FileTreeNode> {
    const name = path.basename(dirPath);
    const node: FileTreeNode = {
      name,
      path: dirPath,
      type: 'directory',
      children: [],
    };

    if (depth > 8) return node;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sorted) {
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          const childNode = await this.buildFileTree(path.join(dirPath, entry.name), depth + 1);
          node.children!.push(childNode);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          node.children!.push({
            name: entry.name,
            path: path.join(dirPath, entry.name),
            type: 'file',
            extension: ext,
          });
        }
      }
    } catch (error) {
      console.error(`Error building file tree for ${dirPath}:`, error);
    }

    return node;
  }
}
