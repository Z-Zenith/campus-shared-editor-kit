/**
 * SEK-01 — file tree, built from CodeFile.path strings split on '/'.
 *
 * Purely organizational on the editor side — Judge0 has no concept of
 * subfolders at run time (see types.ts's CodeFile doc comment), but the tree
 * is still useful for a student organizing a multi-file project visually.
 * Unstyled (BEM class hooks only) per SEK's styling convention.
 */
import { useMemo } from 'react';
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
}

function Node({
  node,
  depth,
  activeFilePath,
  entryFilePath,
  canEdit,
  onSelect,
  onDeleteFile,
  onSetEntry,
}: {
  node: TreeNode;
  depth: number;
  activeFilePath: string;
  entryFilePath: string;
  canEdit: boolean;
  onSelect: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onSetEntry: (path: string) => void;
}) {
  if (!node.isFile) {
    return (
      <div className="sek-code-editor__tree-folder" style={{ paddingLeft: depth * 12 }}>
        <span className="sek-code-editor__tree-folder-name">
          <span className="sek-code-editor__file-icon" aria-hidden="true">📁</span>
          {node.name}
        </span>
        {node.children.map((child) => (
          <Node
            key={`${child.path}-${child.isFile}`}
            node={child}
            depth={depth + 1}
            activeFilePath={activeFilePath}
            entryFilePath={entryFilePath}
            canEdit={canEdit}
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
}: FileExplorerProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="sek-code-editor__sidebar">
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
            onSelect={onSelect}
            onDeleteFile={onDeleteFile}
            onSetEntry={onSetEntry}
          />
        ))}
      </div>
    </div>
  );
}
