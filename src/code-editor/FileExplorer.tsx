/**
 * SEK-01 — file tree, built from CodeFile.path strings split on '/'.
 *
 * Mirrors the real on-disk layout the Code Execution Service materializes a project into
 * before running it (see types.ts's CodeFile doc comment) — useful for a student organizing
 * a multi-file project visually, not just cosmetic. Unstyled (BEM class hooks only) per
 * SEK's styling convention.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CodeFile, Language } from './types.js';
import { LANGUAGE_ICONS } from './types.js';

interface TreeNode {
  readonly name: string;
  readonly path: string;
  readonly isFile: boolean;
  readonly language?: Language;
  readonly children: TreeNode[];
}

function buildTree(files: readonly CodeFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    let level = root;
    let pathSoFar = '';

    segments.forEach((segment, i) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      const isFile = i === segments.length - 1;
      let node = level.find((n) => n.name === segment && n.isFile === isFile);
      if (!node) {
        node = { name: segment, path: pathSoFar, isFile, ...(isFile ? { language: file.language } : {}), children: [] };
        level.push(node);
      }
      level = node.children;
    });
  }

  return root;
}

interface FileExplorerProps {
  readonly files: readonly CodeFile[];
  readonly activeFilePath: string;
  readonly entryFilePath: string;
  readonly canEdit: boolean;
  readonly onSelect: (path: string) => void;
  readonly onNewFile: () => void;
  readonly onDeleteFile: (path: string) => void;
  readonly onSetEntry: (path: string) => void;
  /** Width, set by CodeEditor.tsx from its resizable-sidebar state (see ResizeHandle.tsx). */
  readonly style?: CSSProperties;
}

function Node({
  node,
  depth,
  activeFilePath,
  entryFilePath,
  canEdit,
  collapsedFolders,
  onToggleFolder,
  onSelect,
  onDeleteFile,
  onSetEntry,
}: {
  node: TreeNode;
  depth: number;
  activeFilePath: string;
  entryFilePath: string;
  canEdit: boolean;
  collapsedFolders: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
  onSelect: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onSetEntry: (path: string) => void;
}) {
  if (!node.isFile) {
    // VS Code-style expand/collapse: collapsed by default only if explicitly toggled
    // (the set starts empty, so every folder starts expanded — matches the pre-existing
    // always-expanded behavior until a student actually collapses one).
    const isCollapsed = collapsedFolders.has(node.path);
    return (
      <div className="sek-code-editor__tree-folder" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          className="sek-code-editor__tree-folder-name"
          onClick={() => onToggleFolder(node.path)}
          aria-expanded={!isCollapsed}
        >
          <span className="sek-code-editor__tree-folder-chevron" aria-hidden="true">
            {isCollapsed ? '▶' : '▼'}
          </span>
          <span className="sek-code-editor__file-icon" aria-hidden="true">{isCollapsed ? '📁' : '📂'}</span>
          {node.name}
        </button>
        {!isCollapsed &&
          node.children.map((child) => (
            <Node
              key={`${child.path}-${child.isFile}`}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              entryFilePath={entryFilePath}
              canEdit={canEdit}
              collapsedFolders={collapsedFolders}
              onToggleFolder={onToggleFolder}
              onSelect={onSelect}
              onDeleteFile={onDeleteFile}
              onSetEntry={onSetEntry}
            />
          ))}
      </div>
    );
  }

  const isActive = node.path === activeFilePath;
  const isEntry = node.path === entryFilePath;

  return (
    <div
      className="sek-code-editor__tree-file"
      data-active={isActive}
      data-entry={isEntry}
      style={{ paddingLeft: depth * 12 }}
    >
      <button
        type="button"
        className="sek-code-editor__tree-file-button"
        onClick={() => onSelect(node.path)}
        title={isEntry ? `${node.path} (entry file)` : node.path}
      >
        <span className="sek-code-editor__file-icon" aria-hidden="true">
          {node.language ? LANGUAGE_ICONS[node.language] : '📄'}
        </span>
        {node.name}
        {isEntry && <span className="sek-code-editor__tree-entry-badge">entry</span>}
      </button>
      {canEdit && !isEntry && (
        <button
          type="button"
          className="sek-code-editor__tree-file-set-entry"
          aria-label={`Set ${node.path} as entry file`}
          title="Set as entry file"
          onClick={() => onSetEntry(node.path)}
        >
          ★
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          className="sek-code-editor__tree-file-delete"
          aria-label={`Delete ${node.path}`}
          onClick={() => onDeleteFile(node.path)}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function FileExplorer({
  files,
  activeFilePath,
  entryFilePath,
  canEdit,
  onSelect,
  onNewFile,
  onDeleteFile,
  onSetEntry,
  style,
}: FileExplorerProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(() => new Set());

  const handleToggleFolder = (path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="sek-code-editor__sidebar" style={style}>
      <div className="sek-code-editor__sidebar-header">
        <span>Explorer</span>
        {canEdit && (
          <button
            type="button"
            className="sek-code-editor__new-file-button"
            onClick={onNewFile}
            aria-label="New file"
            title="New file"
          >
            +
          </button>
        )}
      </div>
      <div className="sek-code-editor__tree">
        {tree.map((node) => (
          <Node
            key={`${node.path}-${node.isFile}`}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            entryFilePath={entryFilePath}
            canEdit={canEdit}
            collapsedFolders={collapsedFolders}
            onToggleFolder={handleToggleFolder}
            onSelect={onSelect}
            onDeleteFile={onDeleteFile}
            onSetEntry={onSetEntry}
          />
        ))}
      </div>
    </div>
  );
}
