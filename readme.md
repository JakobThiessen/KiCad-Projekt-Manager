# KiCad Project Manager

[![PayPal](https://img.shields.io/badge/PayPal-Donate-blue?style=for-the-badge&logo=paypal)](https://paypal.me/jthiessen80) &nbsp; 
[![X](https://srv-cdn.himpfen.io/badges/twitter/twitter-flat.svg)](https://x.com/JakobThiessen) &nbsp; 

A desktop application for managing KiCad electronics projects — built with Electron, React and TypeScript.

> Browse, organize, and preview your KiCad projects without leaving the app. View schematics, PCB layouts, Gerber files, 3D models, PDFs, images, and Markdown documentation — all in one place.

```mermaid
graph LR
    A[KiCad Projects] --> B[KiCad Project Manager]
    B --> C[Schematic Viewer]
    B --> D[PCB Viewer]
    B --> E[Gerber Viewer]
    B --> F[3D Model Viewer]
    B --> G[Markdown / Docs]
    B --> H[PDF / Image Viewer]
```

---

## Features

- **Workspace Management** — Group multiple project folders into a single workspace (`.kicadws` file)
- **Project Discovery** — Auto-detects `.kicad_pro` files, schematics, PCBs, Gerber, 3D models
- **Integrated Viewers**
  - KiCad Schematic (`.kicad_sch`) — powered by [KiCanvas](https://github.com/theacodes/kicanvas) (MIT), fully offline, with hierarchical sub-sheet loading
  - KiCad PCB (`.kicad_pcb`) — KiCanvas-based, layer visibility, persistent layer state across files
  - Gerber (RS-274X / Excellon) — powered by [Tracespace](https://github.com/tracespace/tracespace) (MIT); scans the entire output folder automatically, stacks all copper, soldermask, silkscreen, drill and outline layers into a single PCB composite view, individual layer toggle
  - 3D Models (STEP, VRML) — Three.js viewer with WASM-based STEP import
  - PDF, Images (PNG, JPG, SVG, …)
  - Markdown with Mermaid diagram support
- **Project Explorer** — collapsible editor panel for sidebar-only mode
- **Dark / Light Theme** — Catppuccin-based color scheme
- **Drag & Drop** — Drop folders anywhere to add them to a workspace
- **KiCad Integration** — Open projects directly in KiCad
- **File Watcher** — Auto-refresh on external file changes

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer (LTS recommended)
- [Git](https://git-scm.com/)
- [KiCad](https://www.kicad.org/) (optional — for "Open in KiCad" feature)

### Installation

```powershell
# Clone the repository
git clone https://github.com/<your-username>/KiCad_ProjManager.git
cd KiCad_ProjManager

# On Windows: allow script execution in current session (if needed)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Build for Production

```powershell
# Build and package as installer
npm run dist
```

The installer is created in the `release/` folder.

---

### Browser Mode (without Electron)

The app can also run as a pure web app in the browser. An Express server (port 3001) handles all file system operations, while the Vite app (port 5173) acts as the frontend.

#### Development

```powershell
# Starts Express server (port 3001) + Vite dev server (port 5173) in parallel
# The Vite proxy forwards /api automatically to Express — no CORS issues
npm run dev:browser
```

Then open in browser: **http://localhost:5173**

> **Note (Windows):** If npm scripts are blocked in PowerShell:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
> ```

#### Production Build

```powershell
# Compiles TypeScript (server) + builds Vite bundle
npm run build:browser
```

#### Start Production

```powershell
# Express server serves the built files
npm run start:browser
```

Then open in browser: **http://localhost:3001**

#### Port Overview

| Mode | Port | Description |
|------|------|-------------|
| `dev:browser` – Vite (UI) | 5173 | Frontend with hot-reload, proxies `/api` → 3001 |
| `dev:browser` – Express | 3001 | REST API + SSE file events |
| `start:browser` – Production | 3001 | Express serves UI + API from `dist/` |

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run dev` | Start development mode (Vite + Electron, hot-reload) |
| `npm run build` | Compile TypeScript and build renderer |
| `npm run dist:win` | Build + package with electron-builder (Windows) |
| `npm run dist:linux` | Build + package with electron-builder (Linux) |
| `npm run start` | Run Electron from compiled output |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm run dev:browser` | Browser mode: Express (3001) + Vite (5173) with proxy |
| `npm run build:browser` | Browser mode: TypeScript + Vite production build |
| `npm run start:browser` | Browser mode: Start production server (port 3001) |

---

## Project Structure

```
KiCad_ProjManager/
├── assets/                  # App icon, static assets
├── release/                 # Build output (installer, portable)
├── src/
│   ├── main/                # Electron main process (Node.js)
│   │   ├── main.ts          # Window creation, IPC handlers
│   │   ├── workspaceManager.ts  # .kicadws file management
│   │   └── fileWatcher.ts   # File change detection
│   ├── preload/
│   │   └── preload.ts       # Context bridge (main ↔ renderer)
│   ├── renderer/            # React frontend (Vite-bundled)
│   │   ├── App.tsx          # Root layout component
│   │   ├── main.tsx         # React entry point
│   │   ├── public/          # Static assets served at root
│   │   │   ├── kicanvas.js  # KiCanvas web component (MIT, offline bundle)
│   │   │   └── fonts/
│   │   │       └── MaterialSymbolsOutlined.woff2  # Icon font (offline)
│   │   ├── components/      # UI components
│   │   │   ├── TitleBar.tsx           # Custom titlebar + menu
│   │   │   ├── Sidebar.tsx            # Project/file explorer
│   │   │   ├── EditorArea.tsx         # Viewer routing
│   │   │   ├── TabBar.tsx             # Editor tabs
│   │   │   ├── StatusBar.tsx          # Bottom status bar
│   │   │   ├── WelcomeScreen.tsx      # Start screen
│   │   │   ├── SettingsDialog.tsx
│   │   │   ├── KeyboardShortcutsDialog.tsx  # Keyboard shortcut reference
│   │   │   └── viewers/         # File type viewers
│   │   │       ├── KiCanvasViewer.tsx   # Shared KiCanvas wrapper (sch + pcb)
│   │   │       ├── SchematicViewer.tsx  # Delegates to KiCanvasViewer
│   │   │       ├── PcbViewer.tsx        # Delegates to KiCanvasViewer
│   │   │       ├── GerberViewer.tsx
│   │   │       ├── ModelViewer3D.tsx
│   │   │       ├── MarkdownViewer.tsx
│   │   │       ├── ProjectInfoViewer.tsx
│   │   │       ├── PdfViewer.tsx
│   │   │       ├── ImageViewer.tsx
│   │   │       └── TextViewer.tsx
│   │   ├── store/
│   │   │   └── appStore.ts      # Zustand state management
│   │   ├── styles/
│   │   │   ├── app.css          # Component styles
│   │   │   └── global.css       # CSS variables, theme
│   │   ├── parser/          # KiCad file parsers
│   │   └── editor/          # Editor tools (selection, commands)
│   └── shared/              # Shared between main + renderer
│       ├── types.ts         # Type definitions, IPC channels
│       ├── fileTypes.ts     # File extension mapping
│       └── index.ts
├── package.json
├── tsconfig.json            # Base TypeScript config
├── tsconfig.main.json       # Main process config
├── tsconfig.preload.json    # Preload script config
├── vite.config.ts           # Vite bundler config
└── documentation/           # Detailed documentation
    ├── architecture.md
    ├── development.md
    ├── components.md
    └── api-reference.md
```

---

## Documentation

Detailed documentation is available in the [documentation/](documentation/) folder:

- [Architecture Overview](documentation/architecture.md) — Process model, data flow, workspace format
- [Development Guide](documentation/development.md) — Setup, workflow, debugging, adding new features
- [Component Reference](documentation/components.md) — UI components and viewers
- [API Reference](documentation/api-reference.md) — IPC channels, preload API, store

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | Electron 40 |
| Browser Server | Express 5 + multer + cors |
| Frontend | React 19, TypeScript 5.9 |
| Routing | react-router-dom 7 |
| Bundler | Vite 7 |
| State Management | Zustand 5 |
| Schematic / PCB Viewer | KiCanvas (MIT, bundled offline) |
| Icon Font | Material Symbols Outlined (bundled offline) |
| Gerber Viewer | Tracespace 5 (parser, plotter, renderer — MIT) |
| 3D Rendering | Three.js + React Three Fiber + React Three Drei |
| STEP Import | occt-import-js (WASM) |
| PDF Viewer | PDF.js (pdfjs-dist, Apache 2.0) |
| Markdown | react-markdown + remark-gfm + Mermaid |
| Terminal | xterm.js + xterm Fit Addon |
| Icons | Lucide React |
| Packaging | electron-builder |
| Theming | Catppuccin (CSS custom properties) |

---

## Screenshots

### Schematic Viewer
![Schematic Viewer – Main Sheet](documentation/pict_main_sheet.png)

### Hierarchical Navigation
![Hierarchical Sheet Navigation](documentation/pict_hierarchical_sheet.png)

### Project Info
![Project Description – Overview](documentation/pict_projekt_desc_1.png)

![Project Description – Details](documentation/pict_projekt_desc_2.png)

![Project Description – File Lists](documentation/pict_projekt_desc_3.png)

### Markdown Viewer
![Markdown Rendering with Mermaid](documentation/pict_markdown.png)

---

## License

[MIT](LICENSE) — Free for personal and commercial use.

---

## Support

<!-- This is a comment and will not be rendered
If you find this project useful, consider supporting its development:
[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-☕-yellow?style=for-the-badge)](https://buymeacoffee.com/<your-username>)

-->
