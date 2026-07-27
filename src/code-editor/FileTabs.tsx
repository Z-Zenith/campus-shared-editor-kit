/**
 * SEK-01 — open-file tab strip. All of a project's files are always "open"
 * (no VS Code preview-tab/MRU nuance — out of scope); this just lets the
 * student switch which file the editor pane shows without hunting through
 * the tree each time.
 */
import type { CodeFile } from './types.js';
import { LANGUAGE_ICONS } from './types.js';

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

interface FileTabsProps {
  readonly files: readonly CodeFile[];
  readonly activeFilePath: string;
  readonly entryFilePath: string;
  readonly canEdit: boolean;
  readonly onSelect: (path: string) => void;
  readonly onCloseFile: (path: string) => void;
}

export function FileTabs({ files, activeFilePath, entryFilePath, canEdit, onSelect, onCloseFile }: FileTabsProps) {
  return (
    <div className="sek-code-editor__tabs" role="tablist">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          role="tab"
          aria-selected={file.path === activeFilePath}
          className="sek-code-editor__tab"
          data-active={file.path === activeFilePath}
          onClick={() => onSelect(file.path)}
          title={file.path}
        >
          <span className="sek-code-editor__file-icon" aria-hidden="true">{LANGUAGE_ICONS[file.language]}</span>
          {basename(file.path)}
          {file.path === entryFilePath && <span className="sek-code-editor__tab-entry-badge">•</span>}
          {canEdit && files.length > 1 && (
            <span
              role="button"
              tabIndex={-1}
              className="sek-code-editor__tab-close"
              aria-label={`Close ${file.path}`}
              // Files always have somewhere to fall back to when there's more than
              // one — the last-file-standing guard (see CodeEditor.tsx's
              // handleDeleteFile) means this can never leave zero files open.
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(file.path);
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
