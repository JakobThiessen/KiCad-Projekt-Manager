# Architecture Overview

KiCad Project Manager is a desktop application built on Electron with a three-process architecture.

---

## Process Model

```mermaid
graph TB
    subgraph Main["Main Process (Node.js)"]
        M1[Window Management]
        M2[WorkspaceManager]
        M3[FileWatcher]
        M4[IPC Handlers]
        M5[App Settings]
    end

    subgraph Preload["Preload Script"]
        P1[Context Bridge]
    end

    subgraph Renderer["Renderer Process (React)"]
        R1[App Layout]
        R2[Zustand Store]
        R3[Viewers]
        R4[Sidebar / Explorer]
    end

    Main <-->|IPC via contextBridge| Preload
    Preload <-->|window.api| Renderer
    M3 -->|file:changed| P1
    P1 -->|onFileChanged| R2
```

| Process | Technology | Role |
|---------|-----------|------|
| **Main** | Node.js (CommonJS) | File system access, workspace management, native dialogs, window controls |
| **Preload** | CommonJS, sandboxed | Bridges main ↔ renderer via `contextBridge` |
| **Renderer** | React 19 (Vite ESM) | UI rendering, state management, file viewers |

---

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Renderer as Renderer (React)
    participant Store as Zustand Store
    participant Preload as Preload (window.api)
    participant Main as Main Process

    User->>Renderer: Opens folder via drag & drop
    Renderer->>Preload: window.api.addFolder(path)
    Preload->>Main: ipcRenderer.invoke('workspace:addFolder')
    Main->>Main: WorkspaceManager.addFolder() + scan()
    Main-->>Preload: WorkspaceState
    Preload-->>Renderer: { workspace, added }
    Renderer->>Store: setWorkspace(ws)
    Renderer->>Preload: window.api.getFileTree()
    Preload->>Main: ipcRenderer.invoke('file:tree')
    Main-->>Renderer: FileTreeNode
    Renderer->>Store: setFileTree(tree)
    Store-->>Renderer: Re-render Sidebar
```

---

## Workspace Format

Workspaces are saved as `.kicadws` JSON files:

```json
{
  "version": 1,
  "folders": [
    "D:/Projects/PowerSupply",
    "D:/Projects/MotorController"
  ],
  "excludedProjects": [],
  "settings": {
    "theme": "dark",
    "gridSize": 1.27
  },
  "kicadFilter": false
}
```

| Field | Description |
|-------|-------------|
| `version` | Format version (always `1`) |
| `folders` | Absolute paths to project directories |
| `excludedProjects` | Directories to skip during project scanning |
| `settings` | Project-level settings (theme, grid, KiCad path, etc.) |
| `kicadFilter` | If `true`, sidebar only shows KiCad-related files |

---

## Project Scanning

When a workspace is opened or refreshed, each folder is recursively scanned for `.kicad_pro` files:

```mermaid
flowchart TD
    A[Workspace Folders] --> B[Recursive scan max 10 levels]
    B --> C{Found .kicad_pro?}
    C -->|Yes| D[Parse project JSON]
    C -->|No| E[Continue scanning]
    D --> F[Collect associated files]
    F --> G[.kicad_sch files]
    F --> H[.kicad_pcb files]
    F --> I[Gerber files incl. gerber/ subfolder]
    F --> J[3D models STEP, VRML]
    D --> K[Extract KiCad version from header]
    K --> L[generator_version in .kicad_sch or .kicad_pcb]
```

**Scanning rules:**
- Max recursion depth: 10 levels
- Skips directories starting with `.` (hidden) and `node_modules`
- Checks exclusion list to skip unwanted projects
- Deduplicates projects by directory path

---

## File Type System

Every opened file is classified by its extension into a `KicadFileType`:

| Type | Extensions | Viewer |
|------|-----------|--------|
| `schematic` | `.kicad_sch` | SchematicViewer (Canvas) |
| `pcb` | `.kicad_pcb` | PcbViewer (Canvas) |
| `project` | `.kicad_pro` | ProjectInfoViewer |
| `symbol-lib` | `.kicad_sym` | TextViewer |
| `footprint` | `.kicad_mod` | TextViewer |
| `gerber` | `.gbr`, `.gtl`, `.gbl`, `.gts`, `.gbs`, `.gto`, `.gbo`, `.gtp`, `.gbp`, `.gm1`, `.gko`, `.drl`, `.xln` | GerberViewer (Canvas) |
| `3d-model` | `.step`, `.stp`, `.wrl`, `.vrml` | ModelViewer3D (Three.js) |
| `pdf` | `.pdf` | PdfViewer (iframe) |
| `image` | `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.svg`, `.ico` | ImageViewer |
| `markdown` | `.md`, `.markdown` | MarkdownViewer |
| `unknown` | everything else | TextViewer (fallback) |

---

## TypeScript Configuration

The project uses three TypeScript configurations:

```mermaid
graph TD
    A[tsconfig.json<br/>Base config<br/>ES2022, ESNext modules] --> B[tsconfig.main.json<br/>Main process<br/>CommonJS output → dist/main/]
    A --> C[tsconfig.preload.json<br/>Preload script<br/>CommonJS output → dist/preload/]
    A -.->|Vite handles| D[Renderer<br/>ESM, JSX → dist/renderer/]
```

| Config | Includes | Module | Output |
|--------|----------|--------|--------|
| `tsconfig.json` | All `src/**/*` | ESNext | — (base only) |
| `tsconfig.main.json` | `src/main/` + `src/shared/` | CommonJS | `dist/main/` |
| `tsconfig.preload.json` | `src/preload/` + `src/shared/` | CommonJS | `dist/preload/` |
| Renderer (Vite) | `src/renderer/` + `src/shared/` | ESM | `dist/renderer/` |

---

## Build Pipeline

```mermaid
flowchart LR
    A[Source Code] --> B[tsc tsconfig.main.json]
    A --> C[tsc tsconfig.preload.json]
    A --> D[vite build]
    B --> E[dist/main/]
    C --> F[dist/preload/]
    D --> G[dist/renderer/]
    E & F & G --> H[electron-builder]
    H --> I[release/<br/>Installer + Portable]
```

---

## Security Model

- `contextIsolation: true` — Renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — No `require()` in renderer
- `sandbox: false` — Preload script needs `webUtils` for drag & drop path resolution
- All file system access happens exclusively through well-defined IPC channels
- Production CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
