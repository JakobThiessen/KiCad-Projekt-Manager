import { create } from 'zustand';
import type { WorkspaceState, KicadProject, FileTreeNode, EditorTab, KicadFileType, KiCadInstallation } from '../../shared/types';
import { getKicadFileType } from '../../shared/fileTypes';

interface AppState {
  // Workspace
  workspace: WorkspaceState | null;
  workspaceDirty: boolean;
  fileTree: FileTreeNode | null;
  selectedProject: KicadProject | null;
  isLoading: boolean;

  // Editor tabs
  tabs: EditorTab[];
  activeTabId: string | null;

  // UI state
  sidebarVisible: boolean;
  sidebarWidth: number;
  editorPanelVisible: boolean;
  bottomPanelVisible: boolean;
  theme: 'dark' | 'light';
  settingsOpen: boolean;
  aboutOpen: boolean;
  /** Controls the KiCad Version Check dialog */
  kicadVersionDialogOpen: boolean;
  /** When set, the "Open with KiCad version" dialog is shown for this project */
  kicadOpenWithProject: { project: KicadProject; installations: KiCadInstallation[] } | null;
  /** Controls the Keyboard Shortcuts dialog */
  shortcutsOpen: boolean;

  // Global progress indicator
  globalProgress: { message: string; indeterminate?: boolean } | null;

  // Actions
  setWorkspace: (ws: WorkspaceState) => void;
  setWorkspaceDirty: (dirty: boolean) => void;
  setFileTree: (tree: FileTreeNode) => void;
  selectProject: (project: KicadProject | null) => void;
  setLoading: (loading: boolean) => void;

  // Tab actions
  openTab: (filePath: string, title: string, fileType?: KicadFileType) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabDirty: (tabId: string, dirty: boolean) => void;
  setTabContent: (tabId: string, content: string) => void;

  // UI actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleEditorPanel: () => void;
  toggleBottomPanel: () => void;
  toggleTheme: () => void;
  setSettingsOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setKicadVersionDialogOpen: (open: boolean) => void;
  setKicadOpenWithProject: (data: { project: KicadProject; installations: KiCadInstallation[] } | null) => void;
  setShortcutsOpen: (open: boolean) => void;
  setGlobalProgress: (progress: { message: string; indeterminate?: boolean } | null) => void;
  clearWorkspace: () => void;
}

let tabCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  workspace: null,
  workspaceDirty: false,
  fileTree: null,
  selectedProject: null,
  isLoading: false,
  tabs: [],
  activeTabId: null,
  sidebarVisible: true,
  sidebarWidth: 280,
  editorPanelVisible: true,
  bottomPanelVisible: false,
  theme: (localStorage.getItem('kicad-pm-theme') as 'dark' | 'light') ?? 'dark',
  settingsOpen: false,
  aboutOpen: false,
  kicadVersionDialogOpen: false,
  kicadOpenWithProject: null,
  shortcutsOpen: false,
  globalProgress: null,

  // Workspace
  setWorkspace: (ws) => set({ workspace: ws }),
  setWorkspaceDirty: (dirty) => set({ workspaceDirty: dirty }),
  setFileTree: (tree) => set({ fileTree: tree }),
  selectProject: (project) => set({ selectedProject: project }),
  setLoading: (loading) => set({ isLoading: loading }),

  // Tab management
  openTab: (filePath, title, fileType) => {
    const state = get();
    // Check if tab already open
    // Don't open tabs when editor panel is collapsed
    if (!state.editorPanelVisible) return;

    const existing = state.tabs.find(t => t.filePath === filePath);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const id = `tab-${++tabCounter}`;
    const tab: EditorTab = {
      id,
      title,
      filePath,
      fileType: fileType ?? getKicadFileType(filePath),
      isDirty: false,
    };

    set({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    });
  },

  closeTab: (tabId) => {
    const state = get();
    const idx = state.tabs.findIndex(t => t.id === tabId);
    const newTabs = state.tabs.filter(t => t.id !== tabId);
    
    let newActiveId = state.activeTabId;
    if (state.activeTabId === tabId) {
      // Activate adjacent tab
      if (newTabs.length > 0) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        newActiveId = newTabs[newIdx].id;
      } else {
        newActiveId = null;
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setTabDirty: (tabId, dirty) =>
    set(state => ({
      tabs: state.tabs.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t),
    })),

  setTabContent: (tabId, content) =>
    set(state => ({
      tabs: state.tabs.map(t => t.id === tabId ? { ...t, content } : t),
    })),

  // UI
  toggleSidebar: () => set(s => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  toggleEditorPanel: () => set(s => {
    const next = !s.editorPanelVisible;
    window.api.setEditorPanel(next);
    return { editorPanelVisible: next };
  }),
  toggleBottomPanel: () => set(s => ({ bottomPanelVisible: !s.bottomPanelVisible })),
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('kicad-pm-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    return { theme: next };
  }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setAboutOpen: (open) => set({ aboutOpen: open }),
  setKicadVersionDialogOpen: (open) => set({ kicadVersionDialogOpen: open }),
  setKicadOpenWithProject: (data) => set({ kicadOpenWithProject: data }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setGlobalProgress: (progress) => set({ globalProgress: progress }),
  clearWorkspace: () => set({
    workspace: null,
    workspaceDirty: false,
    fileTree: null,
    selectedProject: null,
    tabs: [],
    activeTabId: null,
  }),
}));
