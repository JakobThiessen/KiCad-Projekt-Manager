# API Reference

This document covers the full IPC interface, preload API, Zustand store, and shared type definitions of KiCad Project Manager.

---

## Table of Contents

- [IPC Channels](#ipc-channels)
- [Preload API (`window.api`)](#preload-api-windowapi)
- [Zustand Store (`useAppStore`)](#zustand-store-useappstore)
- [Type Definitions](#type-definitions)
- [File Type Mapping](#file-type-mapping)

---

## IPC Channels

All IPC channel names are defined as constants in `src/shared/types.ts` (`IPC_CHANNELS`).  
Communication follows Electron's `ipcRenderer.invoke` / `ipcMain.handle` pattern (request–response) or `ipcRenderer.send` / `ipcMain.on` (fire-and-forget).

### Workspace Channels

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `workspace:open` | `OPEN_WORKSPACE` | invoke → handle | Open a workspace by folder path |
| `workspace:openFile` | `OPEN_WORKSPACE_FILE` | invoke → handle | Open a `.kicadws` file and load workspace |
| `workspace:get` | `GET_WORKSPACE` | invoke → handle | Get the currently loaded `WorkspaceState` |
| `workspace:scan` | `SCAN_WORKSPACE` | invoke → handle | Re-scan all folders and detect projects |
| `workspace:addFolder` | `ADD_FOLDER` | invoke → handle | Add a directory to the workspace |
| `workspace:removeFolder` | `REMOVE_FOLDER` | invoke → handle | Remove a directory from the workspace |
| `workspace:excludeProject` | `EXCLUDE_PROJECT` | invoke → handle | Exclude a project directory from detection |
| `workspace:create` | `CREATE_WORKSPACE` | invoke → handle | Create a new untitled workspace |
| `workspace:save` | `SAVE_WORKSPACE` | invoke → handle | Save the workspace to its current `.kicadws` path |
| `workspace:saveAs` | `SAVE_WORKSPACE_AS` | invoke → handle | Save the workspace to a new file (shows save dialog) |
| `workspace:setFilter` | `SET_WORKSPACE_FILTER` | invoke → handle | Set the KiCad-only filter flag |

### File Channels

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `file:read` | `READ_FILE` | invoke → handle | Read a file as UTF-8 text |
| `file:readBase64` | `READ_FILE_BASE64` | invoke → handle | Read a file as base64 string (binary files) |
| `file:write` | `WRITE_FILE` | invoke → handle | Write UTF-8 text content to a file |
| `file:tree` | `GET_FILE_TREE` | invoke → handle | Get the full `FileTreeNode` tree for the workspace |
| `file:changed` | `FILE_CHANGED` | main → renderer | Notification when a watched file/directory changes |

### Dialog Channels

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `dialog:open` | `SHOW_OPEN_DIALOG` | invoke → handle | Show native open file/folder dialog |
| `dialog:save` | `SHOW_SAVE_DIALOG` | invoke → handle | Show native save dialog |

### KiCad Integration

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `kicad:launch` | `LAUNCH_KICAD` | invoke → handle | Launch KiCad with a specific file |
| `kicad:ipc:connect` | `KICAD_IPC_CONNECT` | invoke → handle | Connect to KiCad IPC socket |
| `kicad:ipc:send` | `KICAD_IPC_SEND` | invoke → handle | Send command to KiCad IPC |

### Shell Integration

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `shell:showInExplorer` | `SHOW_IN_EXPLORER` | send (fire & forget) | Reveal file in OS file explorer |
| `shell:openInDefaultApp` | `OPEN_IN_DEFAULT_APP` | invoke → handle | Open file/URL in default application |

### Settings

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `settings:get` | `GET_SETTINGS` | invoke → handle | Get project-level settings |
| `settings:set` | `SET_SETTINGS` | invoke → handle | Save project-level settings |
| `app:getSettings` | `GET_APP_SETTINGS` | invoke → handle | Get application-level settings |
| `app:setSettings` | `SET_APP_SETTINGS` | invoke → handle | Save application-level settings |
| `app:getRecent` | `GET_RECENT_WORKSPACES` | invoke → handle | Get list of recent workspace paths |
| `app:addRecent` | `ADD_RECENT_WORKSPACE` | invoke → handle | Add a path to recent workspaces |
| `app:clearRecent` | `CLEAR_RECENT_WORKSPACES` | invoke → handle | Clear the recent workspaces list |

### WASM

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `wasm:getBinary` | `GET_WASM_BINARY` | invoke → handle | Load a WASM binary as base64 (bypasses dev server MIME issues) |

### Window Controls

| Channel | Constant | Direction | Description |
|---|---|---|---|
| `window:minimize` | `MINIMIZE_WINDOW` | send | Minimize the window |
| `window:maximize` | `MAXIMIZE_WINDOW` | send | Toggle maximize/restore |
| `window:close` | `CLOSE_WINDOW` | send | Close the window |
| `window:setEditorPanel` | `SET_EDITOR_PANEL` | send | Collapse/expand the editor panel (resizes window) |

---

## Preload API (`window.api`)

The preload script (`src/preload/preload.ts`) uses `contextBridge.exposeInMainWorld` to provide a safe API to the renderer process.

### Workspace

```typescript
window.api.openWorkspace(workspacePath: string): Promise<WorkspaceState>
window.api.openWorkspaceFile(wsFilePath: string): Promise<WorkspaceState>
window.api.getWorkspace(): Promise<WorkspaceState | null>
window.api.scanWorkspace(): Promise<WorkspaceState>
window.api.addFolder(folderPath: string): Promise<{ added: boolean; workspace: WorkspaceState }>
window.api.removeFolder(folderPath: string): Promise<WorkspaceState>
window.api.excludeProject(projectDir: string): Promise<WorkspaceState>
window.api.createWorkspace(): Promise<WorkspaceState>
window.api.saveWorkspace(): Promise<{ success: boolean; workspace?: WorkspaceState }>
window.api.saveWorkspaceAs(): Promise<{ success: boolean; canceled?: boolean; error?: string; workspace?: WorkspaceState }>
```

### File Operations

```typescript
window.api.readFile(filePath: string): Promise<string>
window.api.readFileBase64(filePath: string): Promise<string>
window.api.writeFile(filePath: string, content: string): Promise<void>
window.api.getFileTree(): Promise<FileTreeNode | null>
window.api.onFileChanged(callback: (filePath: string) => void): () => void  // returns unsubscribe
```

### Dialogs

```typescript
window.api.showOpenDialog(options?: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue>
```

### KiCad Integration

```typescript
window.api.launchKicad(filePath: string): Promise<void>
```

### Shell

```typescript
window.api.showInExplorer(filePath: string): void           // fire-and-forget
window.api.openInDefaultApp(filePath: string): Promise<void>
```

### Settings

```typescript
window.api.getSettings(): Promise<ProjectSettings>
window.api.setSettings(settings: Partial<ProjectSettings>): Promise<void>
window.api.getAppSettings(): Promise<AppSettings>
window.api.setAppSettings(settings: Partial<AppSettings>): Promise<void>
window.api.getRecentWorkspaces(): Promise<string[]>
window.api.clearRecentWorkspaces(): Promise<void>
```

### Workspace Filter

```typescript
window.api.setWorkspaceFilter(enabled: boolean): Promise<void>
```

### WASM

```typescript
window.api.getWasmBinary(moduleName: string): Promise<string>  // base64-encoded WASM binary
```

### File Utilities

```typescript
window.api.getPathForFile(file: File): string  // Electron webUtils.getPathForFile
```

### Window Controls

```typescript
window.api.minimizeWindow(): void
window.api.maximizeWindow(): void
window.api.closeWindow(): void
window.api.setEditorPanel(visible: boolean): void
```

---

## Zustand Store (`useAppStore`)

Defined in `src/renderer/store/appStore.ts`. Created with `create<AppState>()` from Zustand.

### State Shape

```typescript
interface AppState {
  // ── Workspace ──────────────────────────
  workspace: WorkspaceState | null;
  workspaceDirty: boolean;
  fileTree: FileTreeNode | null;
  selectedProject: KicadProject | null;
  isLoading: boolean;

  // ── Tabs ───────────────────────────────
  tabs: EditorTab[];
  activeTabId: string | null;

  // ── UI ─────────────────────────────────
  sidebarVisible: boolean;        // default: true
  sidebarWidth: number;           // default: 280
  editorPanelVisible: boolean;    // default: true
  bottomPanelVisible: boolean;    // default: false
  theme: 'dark' | 'light';       // persisted in localStorage
  settingsOpen: boolean;          // default: false
}
```

### Actions

#### Workspace Actions

| Action | Signature | Description |
|---|---|---|
| `setWorkspace` | `(ws: WorkspaceState) => void` | Replace current workspace |
| `setWorkspaceDirty` | `(dirty: boolean) => void` | Mark workspace as modified |
| `setFileTree` | `(tree: FileTreeNode) => void` | Update the file tree |
| `selectProject` | `(project: KicadProject \| null) => void` | Select/deselect a project |
| `setLoading` | `(loading: boolean) => void` | Set global loading state |
| `clearWorkspace` | `() => void` | Reset all workspace, tabs, and selection |

#### Tab Actions

| Action | Signature | Description |
|---|---|---|
| `openTab` | `(filePath, title, fileType?) => void` | Open a file in a new tab (or focus existing). **Returns early** if `editorPanelVisible` is `false`. |
| `closeTab` | `(tabId: string) => void` | Close a tab, activate adjacent |
| `setActiveTab` | `(tabId: string) => void` | Switch active tab |
| `setTabDirty` | `(tabId, dirty) => void` | Mark a tab as modified |
| `setTabContent` | `(tabId, content) => void` | Store file content in tab |

#### UI Actions

| Action | Signature | Description |
|---|---|---|
| `toggleSidebar` | `() => void` | Toggle sidebar visibility |
| `setSidebarWidth` | `(width: number) => void` | Set sidebar pixel width |
| `toggleEditorPanel` | `() => void` | Toggle editor panel; calls `window.api.setEditorPanel()` to resize window |
| `toggleBottomPanel` | `() => void` | Toggle bottom panel (placeholder) |
| `toggleTheme` | `() => void` | Switch dark ↔ light; persists to `localStorage`, updates `data-theme` |
| `setSettingsOpen` | `(open: boolean) => void` | Show/hide settings dialog |

### Usage Pattern

```tsx
import { useAppStore } from '../store/appStore';

function MyComponent() {
  // Subscribe to specific slices (prevents unnecessary re-renders)
  const workspace = useAppStore(s => s.workspace);
  const openTab = useAppStore(s => s.openTab);
  
  // Access full state imperatively (outside React)
  const state = useAppStore.getState();
}
```

---

## Type Definitions

All shared types are in `src/shared/types.ts`.

### `KicadProject`

```typescript
interface KicadProject {
  name: string;            // Project name (without extension)
  path: string;            // Absolute path to .kicad_pro
  directory: string;       // Parent directory
  schematicFiles: string[];
  pcbFiles: string[];
  gerberFiles: string[];
  modelFiles: string[];    // STEP, VRML files
  kicadVersion?: string;   // e.g. "9.0" (parsed from generator_version)
  lastModified: number;    // Unix timestamp
}
```

### `WorkspaceState`

```typescript
interface WorkspaceState {
  filePath: string;           // Path to .kicadws file
  folders: string[];          // Registered folder paths
  projects: KicadProject[];   // Detected projects
  kicadFilter: boolean;       // Filter active flag
}
```

### `WorkspaceFile`

The JSON structure persisted in `.kicadws` files:

```typescript
interface WorkspaceFile {
  version: 1;
  folders: string[];
  excludedProjects: string[];
  settings: Partial<ProjectSettings>;
  kicadFilter?: boolean;
}
```

### `FileTreeNode`

```typescript
interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];   // Only for directories
  extension?: string;          // e.g. ".kicad_sch"
}
```

### `EditorTab`

```typescript
interface EditorTab {
  id: string;              // Auto-generated "tab-{n}"
  title: string;           // Display name
  filePath: string;        // Absolute file path
  fileType: KicadFileType; // Determines which viewer to use
  isDirty: boolean;
  content?: string;        // Lazily loaded file content
}
```

### `KicadFileType`

```typescript
type KicadFileType = 
  | 'schematic'    // .kicad_sch
  | 'pcb'          // .kicad_pcb
  | 'project'      // .kicad_pro
  | 'symbol-lib'   // .kicad_sym
  | 'footprint'    // .kicad_mod
  | 'gerber'       // .gbr, .gtl, .gbl, .gts, .gbs, .gto, .gbo, etc.
  | '3d-model'     // .step, .stp, .wrl, .vrml
  | 'pdf'          // .pdf
  | 'image'        // .png, .jpg, .gif, .bmp, .webp, .svg, .ico
  | 'markdown'     // .md, .markdown
  | 'unknown';     // fallback
```

### `ProjectSettings`

```typescript
interface ProjectSettings {
  kicadInstallPath: string;
  libraryPaths: string[];
  model3dPaths: string[];
  theme: 'dark' | 'light';
  gridSize: number;           // mm, default 1.27
  autosaveInterval: number;   // seconds
  recentMaxCount: number;     // max recent workspace entries
}
```

### `AppSettings`

```typescript
interface AppSettings {
  theme: 'dark' | 'light';
  recentMaxCount: number;
  recentWorkspaces: string[];
}
```

---

## File Type Mapping

Defined in `src/shared/fileTypes.ts`. The `getKicadFileType(filePath)` function maps file extensions to `KicadFileType` values:

| Extension(s) | Type |
|---|---|
| `.kicad_sch` | `schematic` |
| `.kicad_pcb` | `pcb` |
| `.kicad_pro` | `project` |
| `.kicad_sym` | `symbol-lib` |
| `.kicad_mod` | `footprint` |
| `.kicad_dru`, `.kicad_wks` | `unknown` |
| `.gbr`, `.gtl`, `.gbl`, `.gts`, `.gbs`, `.gto`, `.gbo`, `.gtp`, `.gbp`, `.gm1`, `.gko`, `.drl`, `.xln`, `.gbrjob` | `gerber` |
| `.step`, `.stp`, `.wrl`, `.vrml` | `3d-model` |
| `.pdf` | `pdf` |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.svg`, `.ico` | `image` |
| `.md`, `.markdown` | `markdown` |
| *anything else* | `unknown` |

The `isKicadProject(filePath)` function returns `true` if the path ends with `.kicad_pro`.

---

## Parser Modules

### S-Expression Parser (`parser/sexpr.ts`)

Low-level tokenizer and recursive-descent parser for KiCad's S-expression format.

```typescript
type SExpr = string | SExpr[];

function parseSExpr(input: string): SExpr;
```

### Schematic Parser (`parser/schematicParser.ts`)

Parses `.kicad_sch` files into structured data.

```typescript
class KicadSchematicParser {
  parse(content: string): SchematicData;
}
```

**Key output types:** `SchematicData`, `SchematicElement`, `LibSymbol`, `LibPin`, `Sheet`, `Bus`, `BusEntry`

### PCB Parser (`parser/pcbParser.ts`)

Parses `.kicad_pcb` files into structured data.

```typescript
class KicadPcbParser {
  parse(content: string): PcbData;
}
```

**Key output types:** `PcbData`, `PcbFootprint`, `FpGraphic`, `BoardLine`, `PcbZone`

---

## Main Process Modules

### `main/main.ts`

Entry point for the Electron main process. Responsibilities:

- Window creation with frameless configuration
- IPC handler registration for all channels
- File system operations (read, write, base64)
- Native dialog wrappers
- KiCad process launching
- Shell integration (show in explorer, open in default app)
- WASM binary serving
- Window state management (collapse/expand for editor panel)
- Settings persistence
- Recent workspaces management

### `main/workspaceManager.ts`

Manages workspace state and project scanning:

- `.kicadws` file reading/writing
- Recursive directory scanning for `.kicad_pro` files
- Project metadata extraction (schematic/PCB/gerber/model file detection)
- KiCad version parsing from `generator_version` in schematic/PCB headers
- Folder add/remove operations
- Project exclusion list management
- File tree generation

### `main/fileWatcher.ts`

Watches workspace directories for file system changes:

- Uses `chokidar` or Node.js `fs.watch` for file monitoring
- Debounces change events
- Sends `file:changed` IPC events to the renderer
- Automatically starts/stops watching when folders are added/removed
