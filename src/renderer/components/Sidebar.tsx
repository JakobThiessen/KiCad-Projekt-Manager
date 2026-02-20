import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  FolderOpen, RefreshCw, ChevronRight, FileText, Cpu, CircuitBoard,
  Layers, Box, File, FolderClosed, FolderPlus, FolderMinus,
  ExternalLink, FolderSearch, Trash2, Filter, ChevronsDownUp, BookOpen, Image,
  PanelRightOpen, PanelRightClose
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { FileTreeNode, KicadProject } from '../../shared/types';
import { getKicadFileType, isKicadProject } from '../../shared/fileTypes';

export function Sidebar() {
  const workspace = useAppStore(s => s.workspace);
  const fileTree = useAppStore(s => s.fileTree);
  const selectedProject = useAppStore(s => s.selectedProject);
  const workspaceDirty = useAppStore(s => s.workspaceDirty);
  const setWorkspace = useAppStore(s => s.setWorkspace);
  const setFileTree = useAppStore(s => s.setFileTree);
  const selectProject = useAppStore(s => s.selectProject);
  const setWorkspaceDirty = useAppStore(s => s.setWorkspaceDirty);
  const [activeView, setActiveView] = useState<'projects' | 'files'>('projects');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [kicadFilter, setKicadFilterLocal] = useState(false);
  const [collapseCounter, setCollapseCounter] = useState(0);
  const editorPanelVisible = useAppStore(s => s.editorPanelVisible);
  const toggleEditorPanel = useAppStore(s => s.toggleEditorPanel);

  // Sync filter state from workspace
  useEffect(() => {
    if (workspace) {
      setKicadFilterLocal(workspace.kicadFilter ?? false);
    }
  }, [workspace?.kicadFilter]);

  const setKicadFilter = useCallback((enabled: boolean) => {
    setKicadFilterLocal(enabled);
    window.api.setWorkspaceFilter(enabled);
    setWorkspaceDirty(true);
  }, [setWorkspaceDirty]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Derive workspace display name
  const workspaceName = workspace
    ? workspace.filePath
      ? workspace.filePath.replace(/\\/g, '/').split('/').pop()?.replace('.kicadws', '') ?? 'Workspace'
      : 'Untitled'
    : null;

  const refreshWorkspace = useCallback(async () => {
    if (!workspace) return;
    const ws = await window.api.scanWorkspace();
    if (ws) setWorkspace(ws);
    const tree = await window.api.getFileTree();
    if (tree) setFileTree(tree);
  }, [workspace, setWorkspace, setFileTree]);

  useEffect(() => {
    if (workspace) {
      window.api.getFileTree().then(tree => {
        if (tree) setFileTree(tree);
      });
    }
  }, [workspace, setFileTree]);

  // Listen for file changes
  useEffect(() => {
    const unsubscribe = window.api.onFileChanged(() => {
      refreshWorkspace();
    });
    return unsubscribe;
  }, [refreshWorkspace]);

  const handleAddFolder = useCallback(async () => {
    const result = await window.api.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Add Folder to Workspace',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const res = await window.api.addFolder(result.filePaths[0]);
      if (res.workspace) {
        setWorkspace(res.workspace);
        setWorkspaceDirty(true);
      }
      const tree = await window.api.getFileTree();
      if (tree) setFileTree(tree);
    }
  }, [setWorkspace, setFileTree, setWorkspaceDirty]);

  // Drag & Drop folder support
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
    console.log('[D&D Sidebar] dragOver — types:', Array.from(e.dataTransfer.types));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    console.log('[D&D Sidebar] DROP — files count:', files.length);
    let added = false;
    for (let i = 0; i < files.length; i++) {
      const filePath = window.api.getPathForFile(files[i]);
      console.log('[D&D Sidebar] file[' + i + ']:', filePath, 'name:', files[i].name);
      if (filePath) {
        const res = await window.api.addFolder(filePath);
        console.log('[D&D Sidebar] addFolder result:', JSON.stringify({ added: res.added, hasWorkspace: !!res.workspace, folders: res.workspace?.folders }));
        if (res.workspace) {
          setWorkspace(res.workspace);
          added = true;
        }
      }
    }
    if (added) {
      setWorkspaceDirty(true);
      console.log('[D&D Sidebar] Workspace updated, fetching file tree...');
      const tree = await window.api.getFileTree();
      console.log('[D&D Sidebar] File tree result:', tree ? 'got tree' : 'null');
      if (tree) setFileTree(tree);
    } else {
      console.log('[D&D Sidebar] Nothing was added to workspace');
    }
  }, [setWorkspace, setFileTree, setWorkspaceDirty]);

  return (
    <div
      className={`sidebar${dragOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Workspace name header */}
      {workspaceName && (
        <div className="sidebar-workspace-header">
          <FolderOpen size={14} />
          <span className="sidebar-workspace-name">
            {workspaceName}{workspaceDirty ? ' *' : ''}
          </span>
        </div>
      )}

      <div className="sidebar-header">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={activeView === 'projects' ? 'active' : ''}
            onClick={() => setActiveView('projects')}
            style={{
              background: activeView === 'projects' ? 'var(--bg-overlay)' : 'none',
              border: 'none',
              color: activeView === 'projects' ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.5px',
              fontWeight: 600,
            }}
          >
            Projects
          </button>
          <button
            className={activeView === 'files' ? 'active' : ''}
            onClick={() => setActiveView('files')}
            style={{
              background: activeView === 'files' ? 'var(--bg-overlay)' : 'none',
              border: 'none',
              color: activeView === 'files' ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.5px',
              fontWeight: 600,
            }}
          >
            Files
          </button>
        </div>
        <div className="sidebar-header-actions">
          <button onClick={handleAddFolder} title="Add Folder to Workspace">
            <FolderPlus size={14} />
          </button>
          <button
            onClick={() => setKicadFilter(!kicadFilter)}
            title={kicadFilter ? 'Show all files' : 'Show only KiCad files'}
            className={kicadFilter ? 'filter-active' : ''}
          >
            <Filter size={14} />
          </button>
          <button onClick={() => setCollapseCounter(c => c + 1)} title="Collapse All">
            <ChevronsDownUp size={14} />
          </button>
          <button onClick={refreshWorkspace} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={toggleEditorPanel}
            title={editorPanelVisible ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
            className={editorPanelVisible ? '' : 'filter-active'}
          >
            {editorPanelVisible ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
        </div>
      </div>

      <div className="sidebar-content">
        {activeView === 'projects' ? (
          <ProjectList
            projects={workspace?.projects ?? []}
            selectedProject={selectedProject}
            onSelect={selectProject}
            onContextMenu={setContextMenu}
          />
        ) : (
          <FileTree
            tree={fileTree}
            projects={workspace?.projects ?? []}
            onContextMenu={setContextMenu}
            kicadFilter={kicadFilter}
            collapseCounter={collapseCounter}
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={closeContextMenu} />
      )}
    </div>
  );
}

// --- Project List ---

function ProjectList({
  projects,
  selectedProject,
  onSelect,
  onContextMenu,
}: {
  projects: KicadProject[];
  selectedProject: KicadProject | null;
  onSelect: (p: KicadProject) => void;
  onContextMenu: (menu: ContextMenuState) => void;
}) {
  if (projects.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
        No KiCad projects found in this workspace.
      </div>
    );
  }

  return (
    <div>
      {projects.map(project => (
        <ProjectCard
          key={project.path}
          project={project}
          isSelected={selectedProject?.path === project.path}
          onClick={() => onSelect(project)}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  isSelected,
  onClick,
  onContextMenu,
}: {
  project: KicadProject;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (menu: ContextMenuState) => void;
}) {
  const openTab = useAppStore(s => s.openTab);
  const fileTree = useAppStore(s => s.fileTree);

  // Find markdown files in the project directory (README.md first)
  const mdFiles = useMemo(() => {
    if (!fileTree) return [];
    const normDir = project.directory.replace(/\\/g, '/');
    function findInTree(node: FileTreeNode): string[] {
      const nodePath = node.path.replace(/\\/g, '/');
      if (node.type === 'directory' && nodePath === normDir) {
        const all = (node.children ?? [])
          .filter(c => c.type === 'file' && /\.(md|markdown)$/i.test(c.name));
        // Sort: README.md first (case-insensitive), then others
        all.sort((a, b) => {
          const aIsReadme = /^readme\.(md|markdown)$/i.test(a.name) ? 0 : 1;
          const bIsReadme = /^readme\.(md|markdown)$/i.test(b.name) ? 0 : 1;
          return aIsReadme - bIsReadme;
        });
        return all.map(c => c.path);
      }
      if (node.type === 'directory') {
        for (const child of node.children ?? []) {
          const found = findInTree(child);
          if (found.length > 0) return found;
        }
      }
      return [];
    }
    return findInTree(fileTree);
  }, [fileTree, project.directory]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const handleRemoveProject = async () => {
      const ws = await window.api.excludeProject(project.directory);
      if (ws) {
        useAppStore.getState().setWorkspace(ws);
        useAppStore.getState().setWorkspaceDirty(true);
        // If this project was selected, deselect
        if (useAppStore.getState().selectedProject?.path === project.path) {
          useAppStore.getState().selectProject(null);
        }
      }
    };

    const items: ContextMenuEntry[] = [
      {
        label: 'Open in KiCad',
        icon: <ExternalLink size={14} />,
        onClick: () => window.api.launchKicad(project.path),
      },
      { separator: true },
      {
        label: 'Open in Explorer',
        icon: <FolderSearch size={14} />,
        onClick: () => window.api.showInExplorer(project.path),
      },
      { separator: true },
      {
        label: 'Remove from Workspace',
        icon: <Trash2 size={14} />,
        onClick: handleRemoveProject,
      },
    ];
    onContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div
      className={`project-card ${isSelected ? 'selected' : ''}`}
      title={project.directory}
      onClick={() => {
        onClick();
        openTab(project.path, project.name + '.kicad_pro', 'project');
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="project-card-name">{project.name}</div>
      <div className="project-card-path">{project.directory}</div>
      <div className="project-card-badges">
        {project.schematicFiles.length > 0 && (
          <span
            className="badge badge-sch"
            title={`${project.schematicFiles.length} schematic(s)`}
            onClick={(e) => {
              e.stopPropagation();
              openTab(project.schematicFiles[0], project.name + '.kicad_sch', 'schematic');
            }}
          >
            SCH {project.schematicFiles.length}
          </span>
        )}
        {project.pcbFiles.length > 0 && (
          <span
            className="badge badge-pcb"
            title={`${project.pcbFiles.length} PCB(s)`}
            onClick={(e) => {
              e.stopPropagation();
              openTab(project.pcbFiles[0], project.name + '.kicad_pcb', 'pcb');
            }}
          >
            PCB {project.pcbFiles.length}
          </span>
        )}
        {project.gerberFiles.length > 0 && (
          <span className="badge badge-gerber" title={`${project.gerberFiles.length} Gerber file(s)`}>
            GBR {project.gerberFiles.length}
          </span>
        )}
        {project.modelFiles.length > 0 && (
          <span className="badge badge-3d" title={`${project.modelFiles.length} 3D model(s)`}>
            3D {project.modelFiles.length}
          </span>
        )}
        {mdFiles.length > 0 && (
          <span
            className="badge badge-md"
            title={`${mdFiles.length} Markdown file(s)`}
            onClick={(e) => {
              e.stopPropagation();
              const mdPath = mdFiles[0];
              const mdName = mdPath.split(/[/\\]/).pop() ?? 'README.md';
              openTab(mdPath, mdName, 'markdown');
            }}
          >
            MD {mdFiles.length}
          </span>
        )}
      </div>
    </div>
  );
}

// --- File Tree ---

/** Extensions considered KiCad-relevant for filtering */
const KICAD_FILTER_EXTENSIONS = new Set([
  '.kicad_pro', '.kicad_sch', '.kicad_pcb', '.kicad_sym', '.kicad_mod',
  '.kicad_dru', '.kicad_wks',
  '.gbr', '.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo',
  '.gtp', '.gbp', '.gm1', '.gko', '.drl', '.xln', '.gbrjob',
  '.step', '.stp', '.wrl', '.vrml',
  '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
  '.md', '.markdown',
]);

/** Check if a tree node (or any descendant) contains a KiCad file */
function hasKicadDescendant(node: FileTreeNode): boolean {
  if (node.type === 'file') {
    return KICAD_FILTER_EXTENSIONS.has((node.extension ?? '').toLowerCase());
  }
  return node.children?.some(hasKicadDescendant) ?? false;
}

function FileTree({
  tree,
  projects,
  onContextMenu,
  kicadFilter,
  collapseCounter,
}: {
  tree: FileTreeNode | null;
  projects: KicadProject[];
  onContextMenu: (menu: ContextMenuState) => void;
  kicadFilter: boolean;
  collapseCounter: number;
}) {
  const workspace = useAppStore(s => s.workspace);
  const setWorkspace = useAppStore(s => s.setWorkspace);
  const setFileTree = useAppStore(s => s.setFileTree);

  if (!tree) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
        Open a workspace to view files.
      </div>
    );
  }

  const handleRemoveFolder = async (folderPath: string) => {
    const ws = await window.api.removeFolder(folderPath);
    if (ws) {
      setWorkspace(ws);
      useAppStore.getState().setWorkspaceDirty(true);
    }
    const newTree = await window.api.getFileTree();
    if (newTree) setFileTree(newTree);
  };

  const allFolders = workspace?.folders ?? [];

  const visibleChildren = kicadFilter
    ? tree.children?.filter(hasKicadDescendant)
    : tree.children;

  return (
    <div>
      {visibleChildren?.map(child => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={0}
          projects={projects}
          onContextMenu={onContextMenu}
          kicadFilter={kicadFilter}
          collapseCounter={collapseCounter}
          isRemovableRoot={allFolders.length > 1 && allFolders.some(
            p => p.replace(/\\/g, '/') === child.path.replace(/\\/g, '/')
          )}
          onRemoveRoot={() => handleRemoveFolder(child.path)}
        />
      ))}
    </div>
  );
}

function FileTreeItem({
  node,
  depth,
  projects,
  onContextMenu,
  kicadFilter,
  collapseCounter,
  isRemovableRoot,
  onRemoveRoot,
}: {
  node: FileTreeNode;
  depth: number;
  projects: KicadProject[];
  onContextMenu: (menu: ContextMenuState) => void;
  kicadFilter?: boolean;
  collapseCounter?: number;
  isRemovableRoot?: boolean;
  onRemoveRoot?: () => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const openTab = useAppStore(s => s.openTab);

  // Collapse all when counter changes
  useEffect(() => {
    if (collapseCounter && collapseCounter > 0) {
      setExpanded(false);
    }
  }, [collapseCounter]);

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded);
    } else {
      const fileType = getKicadFileType(node.path);
      if (fileType !== 'unknown') {
        openTab(node.path, node.name, fileType);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuEntry[] = [];

    // Determine the KiCad project for this node
    const isProjectFile = node.extension === '.kicad_pro';
    const projectFromTree = findProjectForPath(node.path, projects);
    const projectFileInDir = node.type === 'directory' ? findProjectFileInDir(node) : undefined;

    // "Open in KiCad" – shown when we can resolve a .kicad_pro file
    if (isProjectFile) {
      items.push({
        label: 'Open in KiCad',
        icon: <ExternalLink size={14} />,
        onClick: () => window.api.launchKicad(node.path),
      });
    } else if (projectFileInDir) {
      items.push({
        label: 'Open Project in KiCad',
        icon: <ExternalLink size={14} />,
        onClick: () => window.api.launchKicad(projectFileInDir),
      });
    } else if (projectFromTree) {
      items.push({
        label: 'Open Project in KiCad',
        icon: <ExternalLink size={14} />,
        onClick: () => window.api.launchKicad(projectFromTree.path),
      });
    }

    if (items.length > 0) {
      items.push({ separator: true });
    }

    // "Open in Explorer" – always available
    items.push({
      label: 'Open in Explorer',
      icon: <FolderSearch size={14} />,
      onClick: () => window.api.showInExplorer(node.path),
    });

    onContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const Icon = getFileIcon(node);
  const ext = (node.extension ?? '').toLowerCase();
  const fileTypeClass =
    ext === '.kicad_sch' ? ' tree-item-schematic' :
    ext === '.kicad_pcb' ? ' tree-item-pcb' :
    (ext === '.gbr' || ext === '.gtl' || ext === '.gbl' || ext === '.gts' || ext === '.gbs' ||
     ext === '.gto' || ext === '.gbo' || ext === '.gtp' || ext === '.gbp' ||
     ext === '.gm1' || ext === '.gko' || ext === '.drl' || ext === '.xln' || ext === '.gbrjob')
      ? ' tree-item-gerber' :
    ext === '.pdf' ? ' tree-item-pdf' :
    (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' ||
     ext === '.bmp' || ext === '.webp' || ext === '.svg' || ext === '.ico')
      ? ' tree-item-image' : '';

  return (
    <>
      <div
        className={`tree-item${fileTypeClass}`}
        title={node.path}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {node.type === 'directory' && (
          <span className={`tree-chevron ${expanded ? 'expanded' : ''}`}>
            <ChevronRight size={12} />
          </span>
        )}
        {node.type === 'file' && <span style={{ width: 16 }} />}
        <span className="tree-item-icon">
          <Icon size={14} />
        </span>
        <span className="tree-item-name" style={{ flex: 1 }}>{node.name}</span>
        {(() => {
          // Show KiCad version badge on .kicad_pro files and project folders
          let version: string | undefined;
          if (node.extension === '.kicad_pro') {
            const proj = projects.find(p => p.path.replace(/\\/g, '/') === node.path.replace(/\\/g, '/'));
            console.log('[tree-version] .kicad_pro match:', node.path, '→ proj:', proj?.name, 'ver:', proj?.kicadVersion, 'projPath:', proj?.path);
            version = proj?.kicadVersion;
          } else if (node.type === 'directory' && node.children?.some(c => c.extension === '.kicad_pro')) {
            const proChild = node.children.find(c => c.extension === '.kicad_pro');
            if (proChild) {
              const proj = projects.find(p => p.path.replace(/\\/g, '/') === proChild.path.replace(/\\/g, '/'));
              console.log('[tree-version] dir match:', node.name, '→ proj:', proj?.name, 'ver:', proj?.kicadVersion);
              version = proj?.kicadVersion;
            }
          }
          return version ? (
            <span className="badge badge-version" title={`KiCad ${version}`}>
              {version}
            </span>
          ) : null;
        })()}
        {isRemovableRoot && (
          <span
            className="tree-item-remove"
            title="Remove Folder from Workspace"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveRoot?.();
            }}
            style={{
              marginLeft: 'auto',
              opacity: 0.4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FolderMinus size={12} />
          </span>
        )}
      </div>
      {node.type === 'directory' && expanded && (() => {
        const children = kicadFilter
          ? node.children?.filter(hasKicadDescendant)
          : node.children;
        return children?.map(child => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            projects={projects}
            onContextMenu={onContextMenu}
            kicadFilter={kicadFilter}
            collapseCounter={collapseCounter}
          />
        ));
      })()}
    </>
  );
}

function getFileIcon(node: FileTreeNode) {
  if (node.type === 'directory') return FolderClosed;
  
  switch (node.extension) {
    case '.kicad_sch': return Cpu;
    case '.kicad_pcb': return CircuitBoard;
    case '.kicad_pro': return FolderOpen;
    case '.kicad_sym': return FileText;
    case '.kicad_mod': return Layers;
    case '.step': case '.stp': case '.wrl': return Box;
    case '.pdf': return BookOpen;
    case '.png': case '.jpg': case '.jpeg': case '.gif':
    case '.bmp': case '.webp': case '.svg': case '.ico': return Image;
    default: return File;
  }
}

// --- Context Menu ---

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  separator?: false;
}

interface ContextMenuSeparator {
  separator: true;
}

type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    top: menu.y,
    left: menu.x,
  };

  return (
    <div className="context-menu" ref={menuRef} style={style}>
      {menu.items.map((item, idx) => {
        if (item.separator) {
          return <div key={idx} className="context-menu-separator" />;
        }
        return (
          <div
            key={idx}
            className="context-menu-item"
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>}
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Find the KiCad project that contains the given file/directory path */
function findProjectForPath(filePath: string, projects: KicadProject[]): KicadProject | undefined {
  const normPath = filePath.replace(/\\/g, '/');
  // Direct match on project file
  const directMatch = projects.find(p => p.path.replace(/\\/g, '/') === normPath);
  if (directMatch) return directMatch;
  // Check if the path is inside a project directory
  return projects.find(p => normPath.startsWith(p.directory.replace(/\\/g, '/') + '/'))
    ?? projects.find(p => normPath === p.directory.replace(/\\/g, '/'));
}

/** Check if a directory node contains a .kicad_pro file */
function findProjectFileInDir(node: FileTreeNode): string | undefined {
  if (node.type === 'file' && node.extension === '.kicad_pro') return node.path;
  if (node.type === 'directory' && node.children) {
    for (const child of node.children) {
      if (child.type === 'file' && child.extension === '.kicad_pro') {
        return child.path;
      }
    }
  }
  return undefined;
}
